/**
 * Upload + stock-import routes.
 *   POST /api/media/upload  (multipart) → save + probe → ClipAsset
 *   POST /api/audio/upload  (multipart) → save narration audio → {path,dur,name}
 *   POST /api/stock/import               → download a stock hit into the library
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import type { ClipAsset, StockImportRequest } from '@deep-vision/shared';
import { config } from '../../config/index.ts';
import { addClip } from '../../services/clipsStore.ts';
import { makeThumbnail, probe, rel } from '../../services/media.ts';

export function mediaRoutes(app: FastifyInstance): void {
  // Background images shipped in assets/background_image — served at
  // /files/<path>. Listing reads the folder live, so dropping a new image in
  // makes it appear everywhere without a code change.
  app.get('/api/backgrounds', async () => {
    try {
      const dir = join(config.root, 'assets', 'background_image');
      const files = await readdir(dir);
      return {
        backgrounds: files
          .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
          .sort()
          .map((f) => `assets/background_image/${f}`),
      };
    } catch {
      return { backgrounds: [] };
    }
  });

  app.post('/api/media/upload', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no file' });
    await mkdir(config.paths.uploads, { recursive: true });
    const safe = file.filename.replace(/[^\w.-]+/g, '_');
    const dest = join(config.paths.uploads, `${nanoid(8)}_${safe}`);
    await pipeline(file.file, createWriteStream(dest));

    const info = await probe(dest);
    const thumbPath = join(config.paths.cache, 'thumbnails', `${nanoid(8)}.jpg`);
    const thumb = await makeThumbnail(dest, thumbPath, Math.min(1, info.durationSec / 2));
    const asset: ClipAsset = {
      id: `clip_${nanoid(10)}`,
      path: rel(dest),
      durationSec: info.durationSec || 5,
      width: info.width || 1920,
      height: info.height || 1080,
      fps: info.fps,
      tags: [safe.replace(/\.[^.]+$/, '')],
      thumbPath: thumb ? rel(thumb) : undefined,
      source: 'user',
    };
    await addClip(asset);
    return { asset };
  });

  app.post('/api/audio/upload', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no file' });
    await mkdir(config.paths.uploads, { recursive: true });
    const safe = file.filename.replace(/[^\w.-]+/g, '_');
    const dest = join(config.paths.uploads, `audio_${nanoid(8)}_${safe}`);
    await pipeline(file.file, createWriteStream(dest));
    const info = await probe(dest);
    return { path: rel(dest), durationSec: info.durationSec || 0, name: safe };
  });

  app.post<{ Body: StockImportRequest }>('/api/stock/import', async (req, reply) => {
    const { result, tags } = req.body ?? {};
    if (!result?.videoUrl) return reply.code(400).send({ error: 'result.videoUrl required' });
    await mkdir(join(config.paths.downloads, result.source), { recursive: true });
    const ext = result.videoUrl.split('?')[0].endsWith('.jpg') ? '.jpg' : '.mp4';
    const dest = join(config.paths.downloads, result.source, `${result.id}${ext}`);

    let res: Response;
    try {
      res = await fetch(result.videoUrl);
    } catch (err) {
      return reply.code(502).send({ error: `download failed: ${(err as Error).message}` });
    }
    if (!res.ok || !res.body) return reply.code(502).send({ error: `download failed: ${res.status}` });
    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));

    const info = await probe(dest);
    const thumbPath = join(config.paths.cache, 'thumbnails', `${result.id}.jpg`);
    const thumb =
      ext === '.mp4' ? await makeThumbnail(dest, thumbPath, Math.min(1, info.durationSec / 2)) : dest;
    const asset: ClipAsset = {
      id: `clip_${nanoid(10)}`,
      path: rel(dest),
      durationSec: info.durationSec || result.durationSec || 5,
      width: info.width || result.width || 1920,
      height: info.height || result.height || 1080,
      fps: info.fps,
      tags: tags ?? [],
      thumbPath: thumb ? rel(thumb) : undefined,
      source: 'stock',
      license: result.source,
    };
    await addClip(asset);
    return { asset };
  });
}
