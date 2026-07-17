/**
 * Types describing a run of the agent pipeline (model/pipeline.ts) and the
 * artifacts each stage produces. The frontend renders these to stream progress.
 */

import type { Beat, GenerationSlot, Timeline, Transcript } from './edl.js';

/** The six pipeline stages, in execution order. */
export type PipelineStage =
  | 'segment' // stage1: script/transcript -> beats
  | 'queries' // stage2: beat -> said/shown queries
  | 'retrieve' // stage3: vector search the clip index
  | 'rerank' // stage4: rerank candidates (semantic + visual)
  | 'pick' // stage5: retrieve-or-generate decision
  | 'history'; // stage6: record picks / pipeline state

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

/** One retrieval candidate for a beat, scored in CLIP space. */
export interface MatchCandidate {
  clipId: string;
  /** Combined score 0..1 after reranking. */
  score: number;
  /** Similarity of the beat's `said` query to the clip (text↔text/image). */
  textScore: number;
  /** Similarity of the beat's `shown` query to the clip's frames. */
  visualScore: number;
  /** Suggested in/out points inside the clip, seconds. */
  inSec?: number;
  outSec?: number;
}

/** Stage5 output for one beat: use a clip, or leave a generation slot. */
export type PickDecision =
  | { beatId: string; kind: 'retrieve'; candidate: MatchCandidate }
  | { beatId: string; kind: 'generate'; slot: GenerationSlot };

/** Progress/result envelope for one stage. */
export interface StageResult<T = unknown> {
  stage: PipelineStage;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  /** Stage-specific payload (Beat[], PickDecision[], ...). */
  output?: T;
  error?: string;
}

/** A full pipeline run, persisted by stage6_history. */
/** Live per-segment detail streamed to the processing monitor UI. */
export interface SegmentProgress {
  beatId: string;
  text: string;
  /** Stage 3's stock-search keyword, set the moment it's extracted. */
  keyword?: string;
  /** Candidates pooled for this segment (stage 4). */
  pooled?: number;
  /** A few candidate thumbnails, so the monitor shows the footage considered. */
  thumbs?: { url: string; source: string }[];
  /** The chosen clip once stage 6 decides. */
  pick?: {
    source: string;
    score: number;
    status: 'auto' | 'auto-fallback' | 'review' | 'none';
    thumb?: string;
  };
}

/** Everything-the-agent-is-doing feed for the processing screen. */
export interface RunProgressInfo {
  model?: 'mini' | 'pro';
  /** Detected niche (Deep Video v1 Mini step 2), set once per project. */
  niche?: string;
  segments: SegmentProgress[];
}

export interface PipelineRun {
  id: string;
  createdAt: string;
  status: StageStatus;
  /** Which stage is currently running (or last ran). */
  stage: PipelineStage;
  stages: StageResult[];
  input: {
    /** Either a raw script or a path to narration audio. */
    script?: string;
    audioPath?: string;
  };
  transcript?: Transcript;
  beats?: Beat[];
  picks?: PickDecision[];
  timeline?: Timeline;
  /** Live monitor feed (niche, keywords, candidate footage, picks). */
  progress?: RunProgressInfo;
}

/** Tunable pipeline settings (defaults live in model/config.ts). */
export interface PipelineSettings {
  /** Candidates fetched per beat in stage3. */
  retrieveTopK: number;
  /** Minimum combined score to accept a clip; below this stage5 leaves a GenerationSlot. */
  matchThreshold: number;
  /** Weight of visualScore vs textScore in the combined score (0..1). */
  visualWeight: number;
  /** Max seconds a single beat may span before stage1 splits it. */
  maxBeatSec: number;
}
