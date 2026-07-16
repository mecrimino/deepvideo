/**
 * Step 7 — anti-repetition.
 * Penalize (never hard-exclude) clips already used in this project, so a
 * genuinely perfect repeat can still win if it dominates. The usage log
 * itself lives behind the injected UsageStore (JSON/SQLite on the server).
 */

import type { StockCandidate } from './types.js';

export function applyRepeatPenalty(
  ranked: StockCandidate[],
  usedIds: Set<string>,
  penalty: number,
): StockCandidate[] {
  if (usedIds.size === 0) return ranked;
  return ranked
    .map((c) => (usedIds.has(c.id) ? { ...c, score: (c.score ?? 0) - penalty } : c))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
