/**
 * Media library management: register uploaded/scanned files as ClipAssets —
 * probe with ffprobe, extract a poster thumbnail, embed the text metadata
 * (filename + tags) into the search space and upsert into the clip index.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ClipAsset } from '@deep-video/shared';
import { uid } from '@deep-video/model';
import type { ClipEmbedder } from './clip.js';
import type { ClipDb } from './db.js';
import { MEDIA_DIR, THUMBS_DIR, toDataRelative } from './paths.js';
import { extractThumb, probe } from './render.js';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);

export function isMediaFile(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  return VIDEO_EXT.has(ext) || IMAGE_EXT.has(ext) || AUDIO_EXT.has(ext);
}

export function isAudioFile(file: string): boolean {
  return AUDIO_EXT.has(path.extname(file).toLowerCase());
}

/** Human words from a filename: "old_railway-bridge 03.mp4" -> "old railway bridge". */
export function tagsFromFilename(file: string): string[] {
  return path
    .basename(file, path.extname(file))
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export interface RegisterOptions {
  source: 'user' | 'stock';
  tags?: string[];
  license?: string;
}

/**
 * Register a media file that already lives under DATA_DIR (uploads are saved
 * to MEDIA_DIR first). Probes, thumbnails, embeds and upserts the asset.
 */
export async function registerMediaFile(
  absPath: string,
  db: ClipDb,
  embedder: ClipEmbedder,
  opts: RegisterOptions,
): Promise<ClipAsset> {
  const meta = await probe(absPath);
  const id = uid('asset');
  const tags = [...new Set([...(opts.tags ?? []), ...tagsFromFilename(absPath)])];

  let thumbPath: string | undefined;
  const isAudio = isAudioFile(absPath);
  if (!isAudio) {
    const thumbAbs = path.join(THUMBS_DIR, `${id}.jpg`);
    try {
      await extractThumb(absPath, Math.min(1, meta.durationSec / 2), thumbAbs);
      thumbPath = toDataRelative(thumbAbs);
    } catch {
      // A missing thumbnail never blocks registration.
    }
  }

  const asset: ClipAsset = {
    id,
    path: toDataRelative(absPath),
    durationSec: meta.durationSec,
    width: meta.width,
    height: meta.height,
    fps: meta.fps || undefined,
    tags,
    thumbPath,
    source: opts.source,
    license: opts.license,
  };

  await db.upsertClip(asset);

  // v1 embeds the clip's text metadata (CLIP frame embeddings slot in here
  // later via insertFrameEmbedding per sampled frame).
  const text = tags.join(' ');
  if (text.trim().length > 0) {
    const vec = await embedder.embedText(text);
    await db.insertFrameEmbedding(id, 0, vec);
  }
  return asset;
}

/** Save an uploaded buffer under MEDIA_DIR with a collision-free name. */
export async function saveUpload(filename: string, data: Buffer): Promise<string> {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const ext = path.extname(filename).toLowerCase() || '.bin';
  const base = path
    .basename(filename, path.extname(filename))
    .replace(/[^\w\- ]+/g, '')
    .slice(0, 60)
    .trim() || 'upload';
  const dest = path.join(MEDIA_DIR, `${base}_${uid()}${ext}`);
  await fs.writeFile(dest, data);
  return dest;
}

/** Scan a directory and register every media file not already in the index. */
export async function indexDirectory(
  dir: string,
  db: ClipDb,
  embedder: ClipEmbedder,
  source: 'user' | 'stock',
): Promise<{ indexed: ClipAsset[]; skipped: number }> {
  const existing = new Set((await db.listAssets()).map((a) => a.path));
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const indexed: ClipAsset[] = [];
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !isMediaFile(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (existing.has(toDataRelative(abs))) {
      skipped++;
      continue;
    }
    try {
      indexed.push(await registerMediaFile(abs, db, embedder, { source }));
    } catch {
      skipped++;
    }
  }
  return { indexed, skipped };
}
