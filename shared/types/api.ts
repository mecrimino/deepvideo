/**
 * Request/response contracts the frontend services are typed against.
 * The backend that implemented these has been removed — the services now fail
 * gracefully until a new core is built, but the types keep the app compiling.
 */

import type { ClipAsset, Project, Timeline, Transcript } from './edl.js';
import type { MatchCandidate, PipelineRun, PipelineSettings } from './pipeline.js';

/* ---------------------------------- misc --------------------------------- */

export interface HealthResponse {
  ok: boolean;
  version: string;
  ffmpeg?: boolean;
  ollama?: boolean;
  whisper?: boolean;
}

export interface ApiError {
  error: string;
  notImplemented?: boolean;
}

/* ------------------------------- transcribe ------------------------------ */

export interface TranscribeRequest {
  audioPath: string;
  language?: string;
}

export interface TranscribeResponse {
  transcript: Transcript;
}

/* ---------------------------------- clips -------------------------------- */

export interface IndexClipsRequest {
  dir: string;
  source: 'user' | 'stock';
}

export interface IndexClipsResponse {
  indexed: number;
  skipped: number;
  assets: ClipAsset[];
}

export interface SearchClipsRequest {
  query: string;
  topK?: number;
}

export interface SearchClipsResponse {
  candidates: MatchCandidate[];
  assets: Record<string, ClipAsset>;
}

/* -------------------------------- pipeline ------------------------------- */

export interface RunPipelineRequest {
  script?: string;
  audioPath?: string;
  settings?: Partial<PipelineSettings>;
  /** 'agent' = the full autonomous Video Agent (research→script→scenes→assets). */
  model?: 'mini' | 'pro' | 'agent';
  /** Kokoro TTS voice name for narration synthesis (e.g. 'af_heart'). */
  voice?: string;
  /** Connected channel's content niche — required; drives per-segment stock keywords. */
  niche?: string;
  /**
   * Use `script` verbatim — skip the idea-expansion front-half. Set by the
   * "generate" hand-off from the Director planning chat, where the script has
   * already been discussed and locked with the user.
   */
  skipExpand?: boolean;
}

/* ----------------------- director planning chat -------------------------- */

/** One turn in the pre-production planning conversation. */
export interface PlanMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Which step of the staged planning conversation we're on. */
export type PlanStage = 'topic' | 'length' | 'outline' | 'script';

/** The Director's current draft of the video, refined across the conversation. */
export interface DirectorPlan {
  /** The current step: pick a topic → length → outline → script. */
  stage: PlanStage;
  /** Stage 1 only: 3-5 specific topic ideas under the broad theme (clickable). */
  topicOptions: string[];
  /** The chosen specific topic (empty until picked). */
  title: string;
  angle: string;
  /** Target length in seconds (null until the user gives one). */
  lengthSec: number | null;
  /** Target script length in characters (paired with lengthSec). */
  targetChars: number | null;
  style: string;
  hook: string;
  /** The section-by-section outline (filled from the outline stage on). */
  outline: string[];
  /** The full, user-approved narration script — filled only at the script stage. */
  script: string;
}

export interface DirectorPlanRequest {
  messages: PlanMessage[];
  model?: 'mini' | 'pro' | 'agent';
}

export interface DirectorPlanResponse {
  /** The Director's chat reply to show in the conversation. */
  reply: string;
  /** The current structured plan, or null until a topic is given. */
  plan: DirectorPlan | null;
  /** True once the user has approved production — enables "Generate". */
  ready: boolean;
}

/* ---------------------------- motion graphics ---------------------------- */

/** Render a motion graphic / text animation on demand (editor replace path). */
export interface MotionRenderRequest {
  text: string;
  secondary?: string;
  template?: 'title_card' | 'lower_third' | 'stat' | 'quote' | 'callout' | 'badge' | 'end_screen';
  preset?: string;
  theme?: string;
  highlight?: string[];
  icon?: string;
  durationSec?: number;
}

export interface MotionRenderResponse {
  asset: ClipAsset;
}

/* --------------------------------- voices -------------------------------- */

/** One narration voice offered by the local Kokoro TTS engine. */
export interface Voice {
  name: string;
  language: string;
  language_code: string;
  gender: string;
  gender_label: string;
}

export interface VoicesResponse {
  voices: Voice[];
  count: number;
  /** Whether the TTS server is reachable right now. */
  available: boolean;
  /** The default voice name to preselect. */
  default: string;
}

export interface RunPipelineResponse {
  run: PipelineRun;
}

/** Slim entry in the server's run list (reload-safe generation discovery). */
export interface RunListItem {
  id: string;
  status: string;
  stage: string | null;
  createdAt: string;
  /** First ~120 chars of the input script, for a display title. */
  script: string;
}

export interface ListRunsResponse {
  runs: RunListItem[];
}

/** Background images shipped in assets/background_image (repo-relative paths). */
export interface ListBackgroundsResponse {
  backgrounds: string[];
}

export interface CancelRunResponse {
  ok: boolean;
}

/* --------------------------------- media --------------------------------- */

export interface UploadMediaResponse {
  asset: ClipAsset;
}

export interface UploadAudioResponse {
  path: string;
  durationSec: number;
  name: string;
}

export interface ListClipsResponse {
  assets: ClipAsset[];
}

/* ----------------------------- stock footage ----------------------------- */

export interface StockResult {
  id: string;
  source: 'pexels' | 'pixabay';
  thumbUrl: string;
  videoUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface StockSearchRequest {
  query: string;
  perSource?: number;
}

export interface StockSearchResponse {
  query: string;
  results: StockResult[];
}

export interface StockImportRequest {
  result: StockResult;
  tags?: string[];
}

export interface StockImportResponse {
  asset: ClipAsset;
}

/* --------------------------------- render -------------------------------- */

export interface RenderRequest {
  timeline: Timeline;
  format?: 'mp4' | 'mov';
  width?: number;
  height?: number;
  burnCaptions?: boolean;
}

export interface RenderResponse {
  outputPath: string;
  durationSec: number;
}

export interface RenderJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  message?: string;
  outputPath?: string;
  url?: string;
  durationSec?: number;
  error?: string;
}

export interface StartRenderResponse {
  job: RenderJob;
}

/* ------------------------------- agent chat ------------------------------- */

export interface AgentMention {
  clipId: string;
  index: number;
  label: string;
}

export interface AgentChatRequest {
  message: string;
  timeline: Timeline;
  mentions?: AgentMention[];
  effort?: 'fast' | 'smart';
}

export interface AgentChatResponse {
  reply: string;
  timeline?: Timeline;
  actions: string[];
  backend?: string;
}

/* --------------------------------- project ------------------------------- */

export interface SaveProjectRequest {
  project: Project;
}

export interface SaveProjectResponse {
  id: string;
  savedAt: string;
}

export interface LoadProjectResponse {
  project: Project;
}

export interface DeleteProjectResponse {
  ok: boolean;
  /** Library assets erased with the project (not used by any other project). */
  clearedAssets?: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  durationSec?: number;
  thumb?: string;
}

export interface ListProjectsResponse {
  projects: ProjectSummary[];
}
