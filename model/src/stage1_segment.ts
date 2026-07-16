/**
 * Stage 1 — segmentation: script or transcript -> beats.
 *
 * A beat is the smallest visual unit (one clip per beat). Uses the LLM to find
 * natural visual boundaries; falls back to sentence/duration splitting when the
 * LLM is unavailable. Beats longer than settings.maxBeatSec are split.
 */

import type { Beat, PipelineSettings, Transcript } from '@deep-video/shared';
import type { LLMClient } from './llm.js';
import { NotImplementedError } from './types.js';

export async function segmentIntoBeats(_input: {
  /** Raw script text (when the user typed a script)... */
  script?: string;
  /** ...or a timed transcript (when the user provided audio). */
  transcript?: Transcript;
  llm: LLMClient;
  settings: PipelineSettings;
}): Promise<Beat[]> {
  throw new NotImplementedError('model/stage1_segment.segmentIntoBeats');
}
