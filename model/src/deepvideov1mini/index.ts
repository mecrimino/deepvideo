/**
 * Deep Video v1 Mini — public surface.
 * The full-video creation model: script (or idea, or narration audio) in →
 * a timeline of verified stock B-roll out, one clip per clause-boundary
 * segment, with weak matches flagged for review instead of shipped silently.
 */

export {
  broadenKeyword,
  CONJUNCTIONS,
  DEFAULT_MINI_SETTINGS,
  KEYWORD_PROMPT,
  MAX_SEG_SEC,
  MINI_KEYWORD_MODEL,
  MINI_NICHE_MODEL,
  NICHE_PROMPT,
  PAUSE_GAP_SEC,
  SCRIPT_PROMPT,
} from './config.js';
export type { MiniSettings } from './config.js';

export type {
  MiniDeps,
  MiniInput,
  MiniLLM,
  MiniMatchResult,
  MiniSegment,
  PickStatus,
  SegmentPick,
  StockCandidate,
  StockSearch,
  TextImageEmbedder,
  UsageStore,
} from './types.js';

export { acquireScript, looksLikeIdea, stripCueTags } from './step0_script.js';
export { segmentScript, segmentTranscriptWords } from './step1_transcribe.js';
export { detectNiche, sanitizeNiche } from './step2_niche.js';
export { extractKeyword, heuristicKeyword, sanitizeKeyword } from './step3_keyword.js';
export { retrieveCandidates } from './step4_retrieve.js';
export { rerankCandidates } from './step5_rerank.js';
export { pickClip } from './step6_pick.js';
export { applyRepeatPenalty } from './step7_history.js';
export { runMiniMatching } from './pipeline.js';
