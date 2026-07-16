/**
 * @deep-video/model — public surface.
 * Import from this file only; stage internals may change freely.
 */

export { CLIP_DIMS, CLIP_MODEL_ID, DEFAULT_SETTINGS, OLLAMA_MODEL, OLLAMA_URL } from './config.js';
export { isLocalMode, keys } from './keys.js';
export { NotImplementedError } from './types.js';
export type { ClipIndex, Embedder, RunStore } from './types.js';

export type { ChatMessage, ChatOptions, LLMClient, ToolCall, ToolDefinition } from './llm.js';
export { OllamaClient, runToolLoop, tryLlmJson } from './llm.js';

export { estimateSpeechSec, splitSentences, topKeywords, uid } from './text.js';

export type { VideoGenerator } from './generate.js';
export { DeferredGenerator } from './generate.js';

export type { PipelineDeps, PipelineInput } from './pipeline.js';
export { runPipeline } from './pipeline.js';

export {
  assembleFromPicks,
  createTimeline,
  insertClip,
  recomputeDuration,
  removeClip,
  replaceClipSource,
  trimClip,
} from './timeline.js';

export { buildCaptions, captionsFromBeats, toSrt, toVtt } from './captions.js';

/**
 * Deep Video v1 Mini — the full-video creation model (7-stage clip-matching
 * spec). Namespaced to avoid collisions with the Pro stages above.
 */
export * as mini from './deepvideov1mini/index.js';

export { segmentIntoBeats } from './stage1_segment.js';
export { buildQueries } from './stage2_queries.js';
export { retrieveCandidates } from './stage3_retrieve.js';
export { rerankCandidates } from './stage4_rerank.js';
export { pickClips } from './stage5_pick.js';
export { listRuns, loadRun, recentlyUsedClipIds, saveRun } from './stage6_history.js';
