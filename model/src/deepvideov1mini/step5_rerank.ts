/**
 * Step 5 — CLIP re-ranking.
 * Embed the Step 3 KEYWORD (not the raw transcript) with the text tower and
 * each candidate's thumbnail with the image tower; rank by cosine similarity.
 * This is the objective relevance check that catches on-keyword-but-wrong
 * footage. Candidates whose thumbnails fail to load are skipped, not scored.
 */

import type { StockCandidate, TextImageEmbedder } from './types.js';

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s; // embeddings are L2-normalized, so dot == cosine
}

export async function rerankCandidates(
  keyword: string,
  candidates: StockCandidate[],
  embedder: TextImageEmbedder,
  concurrency = 4,
): Promise<StockCandidate[]> {
  if (candidates.length === 0) return [];
  const tvec = await embedder.embedText(keyword);

  const scored: StockCandidate[] = [];
  let next = 0;
  async function worker() {
    while (next < candidates.length) {
      const c = candidates[next++];
      try {
        const ivec = await embedder.embedImageUrl(c.thumbUrl);
        scored.push({ ...c, score: dot(tvec, ivec) });
      } catch {
        // unreadable thumbnail -> skip candidate entirely (per spec)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
