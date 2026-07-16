/**
 * Step 4 backend — Pexels + Pixabay video search with an on-disk API cache.
 *
 * Per the spec: query both libraries in parallel, take the top N of each, and
 * cache raw responses so re-running the pipeline on the same script doesn't
 * burn API quota twice. Keys rotate on 429 (multiple keys in .env, see api.md).
 * The cache is a JSON file (DATA_DIR/api-cache.json) keyed by source+query —
 * the JSON equivalent of the spec's api_cache SQLite table.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { mini } from '@deep-video/model';
import { DATA_DIR } from '../paths.js';

type StockCandidate = mini.StockCandidate;
type StockSearch = mini.StockSearch;

const CACHE_FILE = path.join(DATA_DIR, 'api-cache.json');

class JsonApiCache {
  private data: Record<string, StockCandidate[]> | null = null;
  private writing: Promise<void> = Promise.resolve();

  private async load(): Promise<Record<string, StockCandidate[]>> {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')) as Record<string, StockCandidate[]>;
    } catch {
      this.data = {};
    }
    return this.data;
  }

  async get(key: string): Promise<StockCandidate[] | undefined> {
    return (await this.load())[key];
  }

  async set(key: string, value: StockCandidate[]): Promise<void> {
    const data = await this.load();
    data[key] = value;
    this.writing = this.writing.then(() =>
      fs.writeFile(CACHE_FILE, JSON.stringify(data), 'utf8').catch(() => undefined),
    );
    await this.writing;
  }
}

function keysFromEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

interface PexelsVideoFile {
  link: string;
  width?: number;
  height?: number;
  file_type?: string;
}
interface PexelsVideo {
  id: number;
  image: string;
  duration?: number;
  width?: number;
  height?: number;
  video_files: PexelsVideoFile[];
}

/** Prefer a compact mp4 (≈640-1280 wide) so downloads stay quick. */
function pickPexelsFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const mp4s = files.filter((f) => (f.file_type ?? 'video/mp4').includes('mp4') && f.link);
  const sized = mp4s
    .filter((f) => (f.width ?? 0) >= 480 && (f.width ?? 0) <= 1400)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sized[0] ?? mp4s[0];
}

async function searchPexels(query: string, perPage: number, key: string): Promise<StockCandidate[]> {
  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw Object.assign(new Error(`pexels HTTP ${res.status}`), { status: res.status });
  const json = (await res.json()) as { videos?: PexelsVideo[] };
  const out: StockCandidate[] = [];
  for (const v of json.videos ?? []) {
    const file = pickPexelsFile(v.video_files ?? []);
    if (!file) continue;
    out.push({
      id: `px_${v.id}`,
      source: 'pexels',
      thumbUrl: v.image,
      videoUrl: file.link,
      width: file.width ?? v.width,
      height: file.height ?? v.height,
      durationSec: v.duration,
    });
  }
  return out;
}

interface PixabayVideoVariant {
  url: string;
  width?: number;
  height?: number;
  thumbnail?: string;
}
interface PixabayHit {
  id: number;
  duration?: number;
  picture_id?: string;
  videos?: Record<string, PixabayVideoVariant>;
}

async function searchPixabay(query: string, perPage: number, key: string): Promise<StockCandidate[]> {
  const url = new URL('https://pixabay.com/api/videos/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', String(Math.max(3, perPage)));
  url.searchParams.set('safesearch', 'true');
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`pixabay HTTP ${res.status}`), { status: res.status });
  const json = (await res.json()) as { hits?: PixabayHit[] };
  const out: StockCandidate[] = [];
  for (const hit of json.hits ?? []) {
    const variant = hit.videos?.medium ?? hit.videos?.small ?? hit.videos?.large ?? hit.videos?.tiny;
    if (!variant?.url) continue;
    const thumb =
      variant.thumbnail ??
      (hit.picture_id ? `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg` : undefined);
    if (!thumb) continue;
    out.push({
      id: `pb_${hit.id}`,
      source: 'pixabay',
      thumbUrl: thumb,
      videoUrl: variant.url,
      width: variant.width,
      height: variant.height,
      durationSec: hit.duration,
    });
  }
  return out;
}

/** Rotate through keys on 429/quota errors; other failures bubble up. */
async function withRotation<T>(
  keys: string[],
  state: { idx: number },
  fn: (key: string) => Promise<T>,
): Promise<T> {
  if (keys.length === 0) throw new Error('no API keys configured');
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < Math.min(keys.length, 4); attempt++) {
    const key = keys[state.idx % keys.length];
    try {
      return await fn(key);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 401 || status === 403 || (status ?? 0) >= 500) {
        state.idx++;
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('stock search failed');
}

/**
 * The StockSearch dependency: both sources in parallel, cached per
 * (source, query, count). Source failures degrade to the other source rather
 * than failing the segment.
 */
export function createStockSearch(): StockSearch {
  const cache = new JsonApiCache();
  const pexelsKeys = keysFromEnv('PEXELS_API_KEYS');
  const pixabayKeys = keysFromEnv('PIXABAY_API_KEYS');
  const pexelsState = { idx: 0 };
  const pixabayState = { idx: 0 };

  async function cached(
    source: string,
    query: string,
    perSource: number,
    fetcher: () => Promise<StockCandidate[]>,
  ): Promise<StockCandidate[]> {
    const key = `${source}:${perSource}:${query.toLowerCase()}`;
    const hit = await cache.get(key);
    if (hit) return hit;
    const fresh = await fetcher();
    await cache.set(key, fresh);
    return fresh;
  }

  return {
    async search(keyword: string, perSource: number): Promise<StockCandidate[]> {
      const [px, pb] = await Promise.all([
        cached('pexels', keyword, perSource, () =>
          withRotation(pexelsKeys, pexelsState, (k) => searchPexels(keyword, perSource, k)),
        ).catch(() => [] as StockCandidate[]),
        cached('pixabay', keyword, perSource, () =>
          withRotation(pixabayKeys, pixabayState, (k) => searchPixabay(keyword, perSource, k)),
        ).catch(() => [] as StockCandidate[]),
      ]);
      return [...px, ...pb];
    },
  };
}
