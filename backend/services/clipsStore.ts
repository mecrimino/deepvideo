/**
 * Local clip library (Ch13.21 "searchable video brain", simplified).
 *
 * Tracks user-uploaded and imported-stock clips as a JSON catalog under
 * ``cache/clips.json``. Search is a lightweight keyword/overlap score over tags
 * and labels — the semantic CLIP-space search lives in the Python core; this is
 * the fast local index the editor's asset browser reads.
 */

import { join } from 'node:path';
import type { ClipAsset } from '@deep-vision/shared';
import { config } from '../config/index.ts';
import { readJson, writeJson } from './jsonStore.ts';

const CATALOG = join(config.paths.cache, 'clips.json');

export async function listClips(): Promise<ClipAsset[]> {
  return readJson<ClipAsset[]>(CATALOG, []);
}

export async function addClip(asset: ClipAsset): Promise<ClipAsset> {
  const all = await listClips();
  const idx = all.findIndex((c) => c.id === asset.id || c.path === asset.path);
  if (idx >= 0) all[idx] = asset;
  else all.push(asset);
  await writeJson(CATALOG, all);
  return asset;
}

export async function addClips(assets: ClipAsset[]): Promise<void> {
  const all = await listClips();
  const byKey = new Map(all.map((c) => [c.path, c] as const));
  for (const a of assets) byKey.set(a.path, a);
  await writeJson(CATALOG, [...byKey.values()]);
}

/** Drop ids from the catalog; returns the entries that were removed. */
export async function removeClips(ids: Set<string>): Promise<ClipAsset[]> {
  const all = await listClips();
  const gone = all.filter((c) => ids.has(c.id));
  if (gone.length) await writeJson(CATALOG, all.filter((c) => !ids.has(c.id)));
  return gone;
}

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);
}

export interface ScoredClip {
  clipId: string;
  score: number;
}

/** Keyword-overlap ranking over tags + label (0..1). */
export async function searchClips(query: string, topK = 12): Promise<ScoredClip[]> {
  const all = await listClips();
  const q = new Set(tokenize(query));
  if (q.size === 0) return [];
  const scored = all.map((c) => {
    const hay = new Set(tokenize([...(c.tags ?? []), c.license ?? ''].join(' ')));
    let overlap = 0;
    for (const t of q) if (hay.has(t)) overlap += 1;
    return { clipId: c.id, score: overlap / q.size };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
