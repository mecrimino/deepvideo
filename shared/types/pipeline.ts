/**
 * Types describing a generation run and the artifacts each stage produces.
 * The flow/processing screens render these. (The backend that produced them
 * has been removed — these remain as the contract for a future core.)
 */

import type { Beat, GenerationSlot, Timeline, Transcript } from './edl.js';

/** The six pipeline stages, in execution order. */
export type PipelineStage =
  | 'segment'
  | 'queries'
  | 'retrieve'
  | 'rerank'
  | 'pick'
  | 'history';

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

/** One retrieval candidate for a beat, scored in CLIP space. */
export interface MatchCandidate {
  clipId: string;
  score: number;
  textScore: number;
  visualScore: number;
  inSec?: number;
  outSec?: number;
}

/** Pick output for one beat: use a clip, or leave a generation slot. */
export type PickDecision =
  | { beatId: string; kind: 'retrieve'; candidate: MatchCandidate }
  | { beatId: string; kind: 'generate'; slot: GenerationSlot };

/** Progress/result envelope for one stage. */
export interface StageResult<T = unknown> {
  stage: PipelineStage;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  output?: T;
  error?: string;
}

/** Live per-segment detail streamed to the processing monitor UI. */
export interface SegmentProgress {
  beatId: string;
  text: string;
  keyword?: string;
  /** Planned visual treatment: stock_video | stock_image | ai_image | motion_graphics */
  visual?: string;
  pooled?: number;
  thumbs?: { url: string; source: string }[];
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
  niche?: string;
  segments: SegmentProgress[];
}

export interface PipelineRun {
  id: string;
  createdAt: string;
  status: StageStatus;
  stage: PipelineStage;
  stages: StageResult[];
  input: {
    script?: string;
    audioPath?: string;
  };
  transcript?: Transcript;
  beats?: Beat[];
  picks?: PickDecision[];
  timeline?: Timeline;
  progress?: RunProgressInfo;
}

/** Tunable pipeline settings. */
/** Where a scene's footage comes from. */
export type AssetSource = 'mixed' | 'stock_video' | 'stock_image' | 'ai_image';

export interface PipelineSettings {
  retrieveTopK: number;
  matchThreshold: number;
  visualWeight: number;
  maxBeatSec: number;
  /** Footage preference: mixed stock+AI (default), stock video, stock images, or AI images. */
  assetSource?: AssetSource;
  /* Brand profile (per-channel) — applied to every generation. */
  /** Motion-template theme name (e.g. "Crime theme"). */
  theme?: string;
  /** Video/narration language. */
  language?: string;
  /** Compliance: no motion graphics / no captions / no render effects. */
  disableAnimations?: boolean;
  disableOverlays?: boolean;
  disableEffects?: boolean;
  /** Motion-template types never to use. */
  blockedTemplates?: string[];
  /** Background image (repo-relative, e.g. assets/background_image/blue-background.png). */
  background?: string;
}
