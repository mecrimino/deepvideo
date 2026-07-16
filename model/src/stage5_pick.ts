/**
 * Stage 5 — the retrieve-or-generate decision.
 *
 * For each beat: if the best reranked candidate clears settings.matchThreshold,
 * pick it (with in/out points sized to the beat). Otherwise leave a
 * GenerationSlot — v1 renders a placeholder; a future generator fills it
 * (see generate.ts). A slot is ALWAYS better than a misleading clip.
 */

import type { Beat, MatchCandidate, PickDecision, PipelineSettings } from '@deep-video/shared';
import { NotImplementedError } from './types.js';

export async function pickClips(_input: {
  beats: Beat[];
  reranked: Map<string, MatchCandidate[]>;
  settings: PipelineSettings;
}): Promise<PickDecision[]> {
  throw new NotImplementedError('model/stage5_pick.pickClips');
}
