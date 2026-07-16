/**
 * Pipeline configuration. Real values (not a stub) — everything else in this
 * package reads its knobs from here so behavior can be tuned in one place.
 */

import type { PipelineSettings } from '@deep-video/shared';

/** Default tunables for the retrieval pipeline. */
export const DEFAULT_SETTINGS: PipelineSettings = {
  /** Candidates fetched per beat from sqlite-vec in stage3. */
  retrieveTopK: 12,
  /**
   * Minimum combined match score (0..1) for stage5 to accept a clip.
   * Below this the beat gets a GenerationSlot instead of a bad clip.
   * Calibrated for the v1 hashing embedder (keyword-overlap cosine);
   * revisit when CLIP lands (CLIP cosines run lower still, ~0.2-0.35).
   */
  matchThreshold: 0.35,
  /** Weight of visualScore vs textScore when combining in stage4. */
  visualWeight: 0.55,
  /** Beats longer than this are split by stage1. */
  maxBeatSec: 8,
};

/** Ollama's OpenAI-compatible endpoint (local, free). */
export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434/v1';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1';

/** Where server-side data lives (clip index, exports). */
export const DATA_DIR = process.env.DATA_DIR ?? './server/data';

/** CLIP model used by server/clip.ts (transformers.js id, runs on CPU). */
export const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** Embedding dimensionality of CLIP_MODEL_ID's shared text/image space. */
export const CLIP_DIMS = 512;
