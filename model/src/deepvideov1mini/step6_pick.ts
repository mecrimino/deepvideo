/**
 * Step 6 — confidence threshold + fallback.
 * Below the threshold we never auto-select: broaden the keyword once (drop the
 * most specific word), re-search, re-rank — and if it's still weak, return
 * status 'review' so the timeline UI flags it (yellow outline) for a
 * 10-second manual swap instead of silently shipping a wrong clip.
 */

import { broadenKeyword, type MiniSettings } from './config.js';
import { retrieveCandidates } from './step4_retrieve.js';
import { rerankCandidates } from './step5_rerank.js';
import { applyRepeatPenalty } from './step7_history.js';
import type { MiniSegment, SegmentPick, StockCandidate, StockSearch, TextImageEmbedder } from './types.js';

export async function pickClip(
  segment: MiniSegment,
  keyword: string,
  ranked: StockCandidate[],
  deps: { stock: StockSearch; embedder: TextImageEmbedder },
  usedIds: Set<string>,
  settings: MiniSettings,
): Promise<SegmentPick> {
  const best = ranked[0] ?? null;
  if (best && (best.score ?? 0) >= settings.matchThreshold) {
    return { segment, keyword, candidate: best, status: 'auto', score: best.score ?? 0 };
  }

  // Fallback: one broader keyword, re-search, re-rank (against the ORIGINAL
  // keyword embedding, per the spec), same repeat penalty.
  const broad = broadenKeyword(keyword);
  let best2: StockCandidate | null = null;
  if (broad !== keyword) {
    const pool2 = await retrieveCandidates([broad], deps.stock, settings.perSourceCount);
    const ranked2 = applyRepeatPenalty(
      await rerankCandidates(keyword, pool2.slice(0, settings.maxCandidatesPerSegment), deps.embedder),
      usedIds,
      settings.repeatPenalty,
    );
    best2 = ranked2[0] ?? null;
  }

  const cand = [best, best2]
    .filter((c): c is StockCandidate => c !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;

  if (cand && (cand.score ?? 0) >= settings.matchThreshold) {
    return { segment, keyword, candidate: cand, status: 'auto-fallback', score: cand.score ?? 0 };
  }
  if (cand) {
    return { segment, keyword, candidate: cand, status: 'review', score: cand.score ?? 0 };
  }
  return { segment, keyword, candidate: null, status: 'none', score: 0 };
}
