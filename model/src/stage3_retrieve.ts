/**
 * Stage 3 — retrieval: vector-search the clip index for each beat.
 *
 * Embeds each beat's queries with the injected embedder's text tower and
 * kNN-searches the injected index (clip frames/tags were embedded with the
 * same space at index time). The `said` search fills textScore, the `shown`
 * search fills visualScore; stage4 combines them. Pure retrieval; ranking
 * quality is stage4's job.
 */

import type { Beat, MatchCandidate, PipelineSettings } from '@deep-video/shared';
import type { ClipIndex, Embedder } from './types.js';

export async function retrieveCandidates(input: {
  beats: Beat[];
  embedder: Embedder;
  index: ClipIndex;
  settings: PipelineSettings;
}): Promise<Map<string, MatchCandidate[]>> {
  const { beats, embedder, index, settings } = input;
  const out = new Map<string, MatchCandidate[]>();

  for (const beat of beats) {
    const said = beat.queries?.said ?? beat.text;
    const shown = beat.queries?.shown ?? beat.text;

    const [saidVec, shownVec] = await Promise.all([
      embedder.embedText(said),
      embedder.embedText(shown),
    ]);
    const [saidHits, shownHits] = await Promise.all([
      index.search(saidVec, settings.retrieveTopK),
      index.search(shownVec, settings.retrieveTopK),
    ]);

    // Merge the two result lists per clip: said→textScore, shown→visualScore.
    const merged = new Map<string, MatchCandidate>();
    for (const hit of saidHits) {
      merged.set(hit.clipId, { ...hit, textScore: hit.score, visualScore: 0 });
    }
    for (const hit of shownHits) {
      const existing = merged.get(hit.clipId);
      if (existing) {
        existing.visualScore = hit.score;
        existing.inSec = existing.inSec ?? hit.inSec;
        existing.outSec = existing.outSec ?? hit.outSec;
      } else {
        merged.set(hit.clipId, { ...hit, textScore: 0, visualScore: hit.score });
      }
    }

    out.set(beat.id, [...merged.values()]);
  }
  return out;
}
