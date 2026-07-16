/**
 * Request/response contracts for the local Fastify server (server/src/index.ts).
 * The frontend's `src/services/*` modules are typed against these.
 */

import type { ClipAsset, Project, Timeline, Transcript } from './edl.js';
import type { MatchCandidate, PipelineRun, PipelineSettings } from './pipeline.js';

/* ---------------------------------- misc --------------------------------- */

export interface HealthResponse {
  ok: boolean;
  version: string;
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
}

export interface RunPipelineResponse {
  run: PipelineRun;
}

/* --------------------------------- render -------------------------------- */

export interface RenderRequest {
  timeline: Timeline;
  /** Output container; always encoded locally with ffmpeg. */
  format?: 'mp4' | 'mov';
}

export interface RenderResponse {
  /** Path under server/data/exports/. */
  outputPath: string;
  durationSec: number;
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
