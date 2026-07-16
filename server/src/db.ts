/**
 * The clip index — a single local file, no database server.
 *
 * The long-term design is sqlite-vec (`better-sqlite3` + `sqlite-vec`,
 * schema sketch: clips + frames(embedding vec_f32[512]) with a vec index).
 * v1 keeps the exact same ClipDb facade over a JSON catalog file
 * (`${DATA_DIR}/clips.json`) with brute-force cosine search — plenty for a
 * local library of hundreds of clips, zero native-build risk. Swapping in
 * sqlite-vec later only changes this file.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ClipAsset, MatchCandidate } from '@deep-video/shared';

export interface ClipDb {
  upsertClip(asset: ClipAsset): Promise<void>;
  /** Store one sampled frame's (or the metadata text's) embedding for a clip. */
  insertFrameEmbedding(clipId: string, tSec: number, embedding: Float32Array): Promise<void>;
  /** kNN search over frame embeddings; aggregates hits per clip. */
  search(embedding: Float32Array, topK: number): Promise<MatchCandidate[]>;
  getAssets(ids: string[]): Promise<ClipAsset[]>;
  listAssets(): Promise<ClipAsset[]>;
  removeClip(clipId: string): Promise<void>;
  close(): Promise<void>;
}

interface CatalogFrame {
  tSec: number;
  embedding: number[];
}

interface Catalog {
  assets: ClipAsset[];
  /** clipId -> sampled frame embeddings (v1: one entry from text metadata). */
  frames: Record<string, CatalogFrame[]>;
}

class JsonClipDb implements ClipDb {
  private catalog: Catalog = { assets: [], frames: {} };
  private file: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  async open(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Catalog;
      this.catalog = {
        assets: Array.isArray(parsed.assets) ? parsed.assets : [],
        frames: parsed.frames ?? {},
      };
    } catch {
      // First run: start empty; the file is created on first write.
    }
  }

  private persist(): Promise<void> {
    // Serialize writes so concurrent uploads never interleave file contents.
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.catalog), 'utf8');
      await fs.rename(tmp, this.file);
    });
    return this.writeChain;
  }

  async upsertClip(asset: ClipAsset): Promise<void> {
    const i = this.catalog.assets.findIndex((a) => a.id === asset.id);
    if (i >= 0) this.catalog.assets[i] = asset;
    else this.catalog.assets.push(asset);
    await this.persist();
  }

  async insertFrameEmbedding(clipId: string, tSec: number, embedding: Float32Array): Promise<void> {
    const frames = (this.catalog.frames[clipId] ??= []);
    const existing = frames.find((f) => Math.abs(f.tSec - tSec) < 1e-6);
    const value = { tSec, embedding: Array.from(embedding) };
    if (existing) existing.embedding = value.embedding;
    else frames.push(value);
    await this.persist();
  }

  async search(embedding: Float32Array, topK: number): Promise<MatchCandidate[]> {
    const scores: MatchCandidate[] = [];
    for (const asset of this.catalog.assets) {
      const frames = this.catalog.frames[asset.id] ?? [];
      let best = -Infinity;
      let bestT = 0;
      for (const frame of frames) {
        const s = dot(embedding, frame.embedding);
        if (s > best) {
          best = s;
          bestT = frame.tSec;
        }
      }
      if (best === -Infinity) continue;
      const score = Math.max(0, Math.min(1, best)); // cosine, clamped to [0,1]
      if (score <= 0) continue;
      scores.push({
        clipId: asset.id,
        score,
        textScore: score,
        visualScore: score,
        inSec: bestT,
        outSec: undefined,
      });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  async getAssets(ids: string[]): Promise<ClipAsset[]> {
    const set = new Set(ids);
    return this.catalog.assets.filter((a) => set.has(a.id));
  }

  async listAssets(): Promise<ClipAsset[]> {
    return [...this.catalog.assets];
  }

  async removeClip(clipId: string): Promise<void> {
    this.catalog.assets = this.catalog.assets.filter((a) => a.id !== clipId);
    delete this.catalog.frames[clipId];
    await this.persist();
  }

  async close(): Promise<void> {
    await this.writeChain;
  }
}

function dot(a: Float32Array, b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Open (and on first run, create) the index next to `dbPath` (clips.json). */
export async function openDb(dbPath: string): Promise<ClipDb> {
  const jsonPath = dbPath.endsWith('.json')
    ? dbPath
    : path.join(path.dirname(dbPath), 'clips.json');
  const db = new JsonClipDb(jsonPath);
  await db.open();
  return db;
}
