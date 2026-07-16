/**
 * Stage 2 — query building: beat -> search queries.
 *
 * For each beat the LLM derives two queries that live in CLIP's shared space:
 *   said  — semantic content of the narration ("the pilot breaks the record")
 *   shown — the desired imagery ("fighter jet afterburner close-up, dusk sky")
 * Both are embedded and used by stage3/stage4.
 */

import type { Beat, BeatQueries } from '@deep-video/shared';
import type { LLMClient } from './llm.js';
import { NotImplementedError } from './types.js';

export async function buildQueries(_input: {
  beats: Beat[];
  llm: LLMClient;
}): Promise<Map<string, BeatQueries>> {
  throw new NotImplementedError('model/stage2_queries.buildQueries');
}
