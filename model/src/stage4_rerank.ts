/**
 * Stage 4 — rerank: combine semantic + visual evidence per candidate.
 *
 * combined = (1 - visualWeight) * textScore + visualWeight * visualScore
 * Also applies practical penalties: duration mismatch with the beat and
 * recent reuse of the same clip (variety across this run's earlier beats).
 */

import type { Beat, ClipAsset, MatchCandidate, PipelineSettings } from '@deep-video/shared';
import type { ClipIndex } from './types.js';

export async function rerankCandidates(input: {
  beats: Beat[];
  candidates: Map<string, MatchCandidate[]>;
  settings: PipelineSettings;
  /** Optional: asset metadata source for the duration penalty. */
  index?: ClipIndex;
  /** Optional: clip ids used by recent runs (penalized for variety). */
  recentlyUsed?: string[];
}): Promise<Map<string, MatchCandidate[]>> {
  const { beats, candidates, settings, index, recentlyUsed } = input;
  const w = settings.visualWeight;
  const recent = new Set(recentlyUsed ?? []);

  // Fetch asset durations once for every candidate clip id.
  const allIds = [...new Set([...candidates.values()].flat().map((c) => c.clipId))];
  const assets = new Map<string, ClipAsset>();
  if (index && allIds.length > 0) {
    try {
      for (const a of await index.getAssets(allIds)) assets.set(a.id, a);
    } catch {
      // Metadata is a bonus; rerank still works score-only.
    }
  }

  const out = new Map<string, MatchCandidate[]>();
  for (const beat of beats) {
    const beatDur = beat.range.endSec - beat.range.startSec;
    const list = candidates.get(beat.id) ?? [];

    const rescored = list.map((c) => {
      let score = (1 - w) * c.textScore + w * c.visualScore;

      // A clip much shorter than the beat would need a freeze/loop — penalize.
      const asset = assets.get(c.clipId);
      if (asset && asset.durationSec < beatDur) {
        score *= Math.max(0.35, asset.durationSec / beatDur);
      }
      // Variety: gently push down clips that recent runs already used.
      if (recent.has(c.clipId)) score *= 0.85;

      return { ...c, score: Math.max(0, Math.min(1, score)) };
    });

    rescored.sort((a, b) => b.score - a.score);
    out.set(beat.id, rescored);
  }
  return out;
}
