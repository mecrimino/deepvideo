/**
 * Deep Video v1 Mini — types and injected dependency seams.
 * The module is pure logic: all network/disk work (LLM calls, stock APIs,
 * CLIP, usage log) is injected by the server, mirroring the parent package.
 */

import type { PipelineRun, Transcript } from '@deep-video/shared';
import type { MiniSettings } from './config.js';

/** One clause-boundary segment (Step 1) — one visual idea, one clip. */
export interface MiniSegment {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
}

/** A stock-library candidate pooled in Step 4. */
export interface StockCandidate {
  /** Namespaced id, e.g. "px_123" (Pexels) / "pb_456" (Pixabay). */
  id: string;
  source: 'pexels' | 'pixabay';
  /** Representative thumbnail used for CLIP scoring. */
  thumbUrl: string;
  /** Direct video file URL to download when picked. */
  videoUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
  /** CLIP cosine vs the keyword, set by Step 5. */
  score?: number;
}

export type PickStatus =
  | 'auto' /* score >= threshold on the first keyword */
  | 'auto-fallback' /* accepted after the broadened-keyword retry */
  | 'review' /* below threshold — flagged for a manual swap (yellow outline) */
  | 'none'; /* no candidate at all — becomes a GenerationSlot */

/** Step 6 output for one segment. */
export interface SegmentPick {
  segment: MiniSegment;
  keyword: string;
  candidate: StockCandidate | null;
  status: PickStatus;
  score: number;
}

/* ------------------------------ injected deps ----------------------------- */

/** Minimal completion-style LLM seam (one prompt in, text out). */
export interface MiniLLM {
  readonly name: string;
  complete(prompt: string, opts?: { temperature?: number; timeoutMs?: number }): Promise<string>;
}

/** Stock search seam — server implements Pexels+Pixabay with cache/rotation. */
export interface StockSearch {
  search(keyword: string, perSource: number): Promise<StockCandidate[]>;
}

/** CLIP seam — text and image URL embeddings in one space, L2-normalized. */
export interface TextImageEmbedder {
  embedText(text: string): Promise<Float32Array>;
  embedImageUrl(url: string): Promise<Float32Array>;
}

/** Step 7 anti-repetition log. */
export interface UsageStore {
  usedClipIds(projectId: string): Promise<Set<string>>;
  commitPick(projectId: string, clipId: string, sceneTs: number): Promise<void>;
}

export interface MiniDeps {
  /** Step 2 (and Step 0 script writing) — Groq openai/gpt-oss-120b. */
  nicheLLM: MiniLLM;
  /** Step 3 — OpenRouter tencent/hy3:free (falls back to nicheLLM on failure). */
  keywordLLM: MiniLLM;
  stock: StockSearch;
  embedder: TextImageEmbedder;
  usage: UsageStore;
}

export interface MiniInput {
  projectId: string;
  /** Narration script — or a short idea, which Step 0 expands into a script. */
  script?: string;
  /** Timed transcript (whisper) when the user provided narration audio. */
  transcript?: Transcript;
  /**
   * Lazy transcript provider (server-side whisper). Called during the
   * 'segment' stage so the run already exists and streams progress while
   * transcription works. Ignored when `transcript` is set.
   */
  getTranscript?: () => Promise<Transcript>;
  /** Narration audio path, recorded on the run for provenance. */
  audioPath?: string;
  settings?: Partial<MiniSettings>;
  onProgress?: (run: PipelineRun) => void;
}

/** Everything the server needs to assemble + download the final timeline. */
export interface MiniMatchResult {
  run: PipelineRun;
  niche: string;
  script: string;
  segments: MiniSegment[];
  picks: SegmentPick[];
}
