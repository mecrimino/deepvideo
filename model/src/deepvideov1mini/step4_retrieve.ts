/**
 * Step 4 — multi-candidate retrieval.
 * Never trust a stock API's top result: query Pexels + Pixabay with the Step 3
 * keyword, pool the top N of each, and dedupe by clip id. The injected
 * StockSearch does the HTTP + caching; this stage owns pooling semantics.
 */

import type { StockCandidate, StockSearch } from './types.js';

export async function retrieveCandidates(
  keywords: string[],
  stock: StockSearch,
  perSource: number,
): Promise<StockCandidate[]> {
  const results = await Promise.all(
    keywords.map((q) =>
      stock.search(q, perSource).catch(() => [] as StockCandidate[]),
    ),
  );
  const pool: StockCandidate[] = [];
  const seen = new Set<string>();
  for (const list of results) {
    for (const clip of list) {
      if (!seen.has(clip.id)) {
        seen.add(clip.id);
        pool.push(clip);
      }
    }
  }
  return pool;
}
