/**
 * Pipeline-internal types. Cross-package shapes live in @deep-video/shared and
 * are re-exported here for convenience inside model/ code.
 */

export type {
  Beat,
  BeatQueries,
  ClipAsset,
  GenerationSlot,
  MatchCandidate,
  PickDecision,
  PipelineRun,
  PipelineSettings,
  PipelineStage,
  StageResult,
  Timeline,
  TimelineClip,
  Track,
  Transcript,
} from '@deep-video/shared';

/** Thrown by stubbed functions that are not implemented yet. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`TODO(${what}): not implemented yet — see model/CLAUDE.md for the build order`);
    this.name = 'NotImplementedError';
  }
}

/**
 * The retrieval interface stage3 depends on. Implemented by server/src/db.ts
 * (sqlite-vec) and injected into the pipeline so model/ stays storage-agnostic.
 */
export interface ClipIndex {
  /** kNN search the shared CLIP space with a text embedding. */
  search(embedding: Float32Array, topK: number): Promise<import('@deep-video/shared').MatchCandidate[]>;
  /** Look up asset metadata for candidate ids. */
  getAssets(ids: string[]): Promise<import('@deep-video/shared').ClipAsset[]>;
}

/**
 * The embedding interface stages 2-4 depend on. Implemented by server/src/clip.ts
 * (CLIP via transformers.js). Text and images share one vector space.
 */
export interface Embedder {
  readonly dims: number;
  embedText(text: string): Promise<Float32Array>;
  embedImage(imagePath: string): Promise<Float32Array>;
}

/**
 * Persistence seam for pipeline runs (stage6). Implemented by server/ as JSON
 * files under DATA_DIR and injected; model/ itself never touches disk.
 */
export interface RunStore {
  save(run: import('@deep-video/shared').PipelineRun): Promise<void>;
  load(id: string): Promise<import('@deep-video/shared').PipelineRun | null>;
  list(): Promise<Pick<import('@deep-video/shared').PipelineRun, 'id' | 'createdAt' | 'status'>[]>;
}
