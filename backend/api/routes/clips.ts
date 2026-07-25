/**
 * Clip library routes (Ch13.21 searchable library).
 *   GET  /api/clips          → list the local catalog
 *   POST /api/clips/index    → index a folder of media into the catalog
 *   POST /api/clips/search   → keyword search the catalog
 */

import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import type {
  ClipAsset,
  IndexClipsRequest,
  MatchCandidate,
  SearchClipsRequest,
} from '@deep-vision/shared';
import { config } from '../../config/index.ts';
import { addClip, listClips, searchClips } from '../../services/clipsStore.ts';
import { makeThumbnail, probe, rel } from '../../services/media.ts';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function clipRoutes(app: FastifyInstance): void {
  app.get('/api/clips', async () => ({ assets: await listClips() }));

  app.post<{ Body: IndexClipsRequest }>('/api/clips/index', async (req, reply) => {
    const { dir, source } = req.body ?? { dir: '', source: 'user' as const };
    if (!dir) return reply.code(400).send({ error: 'dir required' });
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch (err) {
      return reply.code(400).send({ error: `cannot read dir: ${(err as Error).message}` });
    }
    const assets: ClipAsset[] = [];
    let skipped = 0;
    for (const name of entries) {
      const ext = extname(name).toLowerCase();
      const isVideo = VIDEO_EXT.has(ext);
      const isImage = IMAGE_EXT.has(ext);
      if (!isVideo && !isImage) {
        skipped += 1;
        continue;
      }
      const abs = join(dir, name);
      const info = isVideo ? await probe(abs) : { durationSec: 5, width: 1920, height: 1080, fps: undefined, hasAudio: false };
      const thumbPath = join(config.paths.cache, 'thumbnails', `${name}.jpg`);
      const thumb = isVideo ? await makeThumbnail(abs, thumbPath, Math.min(1, info.durationSec / 2)) : abs;
      const asset: ClipAsset = {
        id: `clip_${nanoid(10)}`,
        path: rel(abs),
        durationSec: info.durationSec,
        width: info.width,
        height: info.height,
        fps: info.fps,
        tags: name.replace(ext, '').split(/[-_ ]+/).filter(Boolean),
        thumbPath: thumb ? rel(thumb) : undefined,
        source,
      };
      await addClip(asset);
      assets.push(asset);
    }
    return { indexed: assets.length, skipped, assets };
  });

  /**
   * Take a file that already lives in the repo (a shipped sfx, a background)
   * into the clip catalog so the timeline can reference it by id. Idempotent —
   * a path already in the catalog returns its existing asset.
   */
  app.post<{ Body: { path: string; tags?: string[] } }>('/api/clips/register', async (req, reply) => {
    const src = req.body?.path;
    if (!src) return reply.code(400).send({ error: 'path required' });
    const abs = resolve(config.root, src);
    if (!abs.startsWith(config.root)) return reply.code(400).send({ error: 'path must be inside the repo' });
    if (!(await stat(abs).catch(() => null))) return reply.code(404).send({ error: `no such file: ${src}` });

    const path = rel(abs);
    const existing = (await listClips()).find((c) => c.path === path);
    if (existing) return { asset: existing };

    const name = basename(abs);
    const ext = extname(name).toLowerCase();
    const isImage = IMAGE_EXT.has(ext);
    const info = await probe(abs);
    const thumb = isImage
      ? abs
      : VIDEO_EXT.has(ext)
        ? await makeThumbnail(abs, join(config.paths.cache, 'thumbnails', `${nanoid(8)}.jpg`), Math.min(1, info.durationSec / 2))
        : null;
    const asset: ClipAsset = {
      id: `clip_${nanoid(10)}`,
      // Audio has no frame size; images report none through ffprobe's format.
      path,
      durationSec: info.durationSec || (isImage ? 5 : 4),
      width: info.width || 0,
      height: info.height || 0,
      fps: info.fps,
      tags: req.body?.tags ?? name.replace(ext, '').split(/[-_ ]+/).filter(Boolean),
      thumbPath: thumb ? rel(thumb) : undefined,
      source: 'user',
    };
    await addClip(asset);
    return { asset };
  });

  app.post<{ Body: SearchClipsRequest }>('/api/clips/search', async (req, reply) => {
    const { query, topK } = req.body ?? { query: '' };
    if (!query) return reply.code(400).send({ error: 'query required' });
    const scored = await searchClips(query, topK ?? 12);
    const all = await listClips();
    const byId = new Map(all.map((c) => [c.id, c] as const));
    const candidates: MatchCandidate[] = scored.map((s) => ({
      clipId: s.clipId,
      score: s.score,
      textScore: s.score,
      visualScore: 0,
    }));
    const assets: Record<string, ClipAsset> = {};
    for (const s of scored) {
      const a = byId.get(s.clipId);
      if (a) assets[s.clipId] = a;
    }
    return { candidates, assets };
  });
}
