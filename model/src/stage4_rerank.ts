/**
 * Stage 4 — rerank: combine semantic + visual evidence per candidate.
 *
 * combined = (1 - visualWeight) * textScore + visualWeight * visualScore
 * Also applies practical penalties: duration mismatch with the beat, recent
 * reuse of the same clip (variety), and aspect-ratio mismatch.
 */

import type { Beat, MatchCandidate, PipelineSettings } from '@deep-video/shared';
import { NotImplementedError } from './types.js';

export async function rerankCandidates(_input: {
  beats: Beat[];
  candidates: Map<string, MatchCandidate[]>;
  settings: PipelineSettings;
}): Promise<Map<string, MatchCandidate[]>> {
  throw new NotImplementedError('model/stage4_rerank.rerankCandidates');
}
