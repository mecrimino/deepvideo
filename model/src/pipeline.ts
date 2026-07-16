/**
 * Pipeline orchestrator: runs stage1 -> stage6 and assembles the timeline.
 *
 * Dependencies (LLM, embedder, clip index, generator) are injected so this
 * package never imports server code or native libraries. server/src/index.ts
 * wires the real implementations in.
 */

import type { PipelineRun, PipelineSettings, Transcript } from '@deep-video/shared';
import { DEFAULT_SETTINGS } from './config.js';
import type { VideoGenerator } from './generate.js';
import type { LLMClient } from './llm.js';
import type { ClipIndex, Embedder } from './types.js';
import { NotImplementedError } from './types.js';

export interface PipelineDeps {
  llm: LLMClient;
  embedder: Embedder;
  index: ClipIndex;
  /** Optional; v1 uses DeferredGenerator (never called, slots stay pending). */
  generator?: VideoGenerator;
}

export interface PipelineInput {
  /** Provide a script OR narration audio's transcript (not both). */
  script?: string;
  transcript?: Transcript;
  settings?: Partial<PipelineSettings>;
  /** Streamed progress callback for the frontend. */
  onProgress?: (run: PipelineRun) => void;
}

/**
 * Run the full pipeline:
 *   1. segmentIntoBeats   (stage1_segment)
 *   2. buildQueries       (stage2_queries)
 *   3. retrieveCandidates (stage3_retrieve)
 *   4. rerankCandidates   (stage4_rerank)
 *   5. pickClips          (stage5_pick)
 *   6. saveRun            (stage6_history)
 * then timeline.assembleFromPicks -> PipelineRun.timeline.
 */
export async function runPipeline(_deps: PipelineDeps, _input: PipelineInput): Promise<PipelineRun> {
  const _settings: PipelineSettings = { ...DEFAULT_SETTINGS, ..._input.settings };
  throw new NotImplementedError('model/pipeline.runPipeline');
}
