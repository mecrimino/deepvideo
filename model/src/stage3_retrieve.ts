/**
 * Stage 3 — retrieval: vector-search the clip index for each beat.
 *
 * Embeds each beat's queries with CLIP's text tower and kNN-searches the
 * sqlite-vec index (clip frames were embedded with the image tower at index
 * time — one shared vector space). Pure retrieval; ranking quality is stage4's job.
 */

import type { Beat, MatchCandidate, PipelineSettings } from '@deep-video/shared';
import type { ClipIndex, Embedder } from './types.js';
import { NotImplementedError } from './types.js';

export async function retrieveCandidates(_input: {
  beats: Beat[];
  embedder: Embedder;
  index: ClipIndex;
  settings: PipelineSettings;
}): Promise<Map<string, MatchCandidate[]>> {
  throw new NotImplementedError('model/stage3_retrieve.retrieveCandidates');
}
