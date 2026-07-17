/**
 * Request/response contracts for the local Fastify server (server/src/index.ts).
 * The frontend's `src/services/*` modules are typed against these.
 */

import type { ClipAsset, Project, Timeline, Transcript } from './edl.js';
import type { MatchCandidate, PipelineRun, PipelineSettings } from './pipeline.js';

/* ---------------------------------- auth --------------------------------- */

/** A local Deep Video account (stored in server/data/users.json). */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /api/auth/signup and /api/auth/login both return this. */
export interface AuthResponse {
  user: AuthUser;
  /** Opaque bearer token; send as Authorization: Bearer <token>. */
  token: string;
}

/** GET /api/auth/me */
export interface MeResponse {
  user: AuthUser | null;
}

/* ---------------------------------- misc --------------------------------- */

export interface HealthResponse {
  ok: boolean;
  version: string;
  /** Capability report so the UI can explain what is available locally. */
  ffmpeg?: boolean;
  ollama?: boolean;
  whisper?: boolean;
}

export interface ApiError {
  error: string;
  /** Set on stubbed endpoints that are not implemented yet. */
  notImplemented?: boolean;
}

/* ------------------------------- transcribe ------------------------------ */

export interface TranscribeRequest {
  /** Path to a local audio/video file to transcribe with whisper.cpp. */
  audioPath: string;
  language?: string;
}

export interface TranscribeResponse {
  transcript: Transcript;
}

/* ---------------------------------- clips -------------------------------- */

/** Scan a folder, probe with ffprobe, embed with CLIP, upsert into sqlite-vec. */
export interface IndexClipsRequest {
  /** Folder of media files to (re)index. */
  dir: string;
  source: 'user' | 'stock';
}

export interface IndexClipsResponse {
  indexed: number;
  skipped: number;
  assets: ClipAsset[];
}

export interface SearchClipsRequest {
  /** Free-text query embedded with CLIP's text tower. */
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
  /**
   * Which production model runs the generation:
   *  - 'mini' — Deep Video v1 Mini (7-stage stock B-roll matching engine)
   *  - 'pro'  — the local-library pipeline (default)
   */
  model?: 'mini' | 'pro';
}

export interface RunPipelineResponse {
  run: PipelineRun;
}

/** POST /api/pipeline/run/:id/cancel */
export interface CancelRunResponse {
  ok: boolean;
}

/* --------------------------------- media --------------------------------- */

export interface UploadMediaResponse {
  asset: ClipAsset;
}

/** POST /api/audio/upload — narration audio for a generation run. */
export interface UploadAudioResponse {
  /** DATA_DIR-relative path; pass as RunPipelineRequest.audioPath. */
  path: string;
  durationSec: number;
  name: string;
}

export interface ListClipsResponse {
  assets: ClipAsset[];
}

/* ----------------------------- stock footage ----------------------------- */

/** One Pexels/Pixabay result shown in the replace picker. */
export interface StockResult {
  id: string;
  source: 'pexels' | 'pixabay';
  thumbUrl: string;
  videoUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

/** POST /api/stock/search — live Pexels+Pixabay search by keyword. */
export interface StockSearchRequest {
  query: string;
  /** Results per source (default 8). */
  perSource?: number;
}

export interface StockSearchResponse {
  query: string;
  results: StockResult[];
}

/** POST /api/stock/import — download a chosen result into the local library. */
export interface StockImportRequest {
  result: StockResult;
  /** Tags to attach (usually the search keyword words). */
  tags?: string[];
}

export interface StockImportResponse {
  asset: ClipAsset;
}

/* --------------------------------- render -------------------------------- */

export interface RenderRequest {
  timeline: Timeline;
  /** Output container; always encoded locally with ffmpeg. */
  format?: 'mp4' | 'mov';
  /** Output resolution override (defaults to the timeline's own size). */
  width?: number;
  height?: number;
  /** Burn caption cues into the video (default true). false = clean video. */
  burnCaptions?: boolean;
}

export interface RenderResponse {
  /** Path under server/data/exports/. */
  outputPath: string;
  durationSec: number;
}

/** Async render job — POST /api/render returns it, GET /api/render/:id polls it. */
export interface RenderJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  /** 0..1 while running. */
  progress: number;
  message?: string;
  /** Set when done: DATA_DIR-relative path and a URL the browser can fetch. */
  outputPath?: string;
  url?: string;
  durationSec?: number;
  error?: string;
}

export interface StartRenderResponse {
  job: RenderJob;
}

/* ------------------------------- agent chat ------------------------------- */

/** A timeline clip the user attached to the message as a mention chip. */
export interface AgentMention {
  clipId: string;
  /** 1-based index on the video track. */
  index: number;
  label: string;
}

export interface AgentChatRequest {
  message: string;
  timeline: Timeline;
  /** Clips referenced by "Add to Deep Video Agent" mention chips. */
  mentions?: AgentMention[];
  /** Fast = library-only quick edits; Smart = deeper work incl. stock downloads. */
  effort?: 'fast' | 'smart';
}

export interface AgentChatResponse {
  reply: string;
  /** Present when the agent edited the timeline. */
  timeline?: Timeline;
  actions: string[];
  /** Which brain answered: 'openrouter' | 'ollama' | 'commands'. */
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

/** DELETE /api/project/:id */
export interface DeleteProjectResponse {
  ok: boolean;
}

/** Card-sized project summary for listings (Home "Recent Generations"). */
export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  durationSec?: number;
  /** DATA_DIR-relative thumbnail of the project's first clip (serve via /files/). */
  thumb?: string;
}

export interface ListProjectsResponse {
  projects: ProjectSummary[];
}
