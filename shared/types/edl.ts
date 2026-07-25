/**
 * EDL (edit decision list) / timeline domain types — the editor's data model.
 *
 * Conventions:
 *  - All times are in SECONDS (floating point) on the project clock.
 *  - All ids are opaque strings (nanoid-style).
 */

/** A half-open interval [startSec, endSec) on the project clock. */
export interface TimeRange {
  startSec: number;
  endSec: number;
}

/** One transcribed word with its timing. */
export interface Word {
  text: string;
  startSec: number;
  endSec: number;
  /** Confidence 0..1 when the ASR engine provides one. */
  confidence?: number;
}

/** Full transcript of the narration audio. */
export interface Transcript {
  text: string;
  words: Word[];
  language: string;
  /** Duration of the source audio in seconds. */
  durationSec: number;
}

/** A "beat" — the smallest visual unit of the story (one clip per beat). */
export interface Beat {
  id: string;
  /** The narration text spoken during this beat. */
  text: string;
  /** Position of the beat on the audio clock. */
  range: TimeRange;
  /** Search queries (what's SAID vs what's SHOWN). */
  queries?: BeatQueries;
}

/** Retrieval queries for one beat. */
export interface BeatQueries {
  /** Semantic query for the narration content (what is said). */
  said: string;
  /** Visual query describing the desired imagery (what is shown). */
  shown: string;
  /** Optional extra keyword terms. */
  keywords?: string[];
}

/** A clip in the local library (user footage or downloaded free stock). */
export interface ClipAsset {
  id: string;
  /** Storage-relative path to the media file. */
  path: string;
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
  /** Freeform descriptive tags (used for filtering, not ranking). */
  tags: string[];
  /** Path to a poster/thumbnail frame, if extracted. */
  thumbPath?: string;
  /** Where the clip came from. */
  source: 'user' | 'stock';
  /** License note for stock footage (e.g. "Pexels", "CC0"). */
  license?: string;
}

/**
 * A slot on the timeline the pipeline could not fill from the library —
 * rendered as a placeholder so a generator can fill it later.
 */
export interface GenerationSlot {
  id: string;
  beatId: string;
  /** Text-to-video prompt derived from the beat's `shown` query. */
  prompt: string;
  /** Desired clip length in seconds. */
  durationSec: number;
  status: 'pending' | 'generating' | 'done' | 'failed';
  /** Populated once a generator produced an asset. */
  assetId?: string;
}

/** Source of a timeline clip: an existing asset, or a to-be-generated slot. */
export type ClipSource =
  | {
      kind: 'asset';
      assetId: string;
      /** In/out points INSIDE the source asset, in seconds. */
      inSec: number;
      outSec: number;
    }
  | {
      kind: 'generate';
      slot: GenerationSlot;
    };

/**
 * The Editing Lab recipe a clip was built from. Kept on the clip so the shot
 * can be re-opened and re-customized any number of times.
 */
export interface ShotSpec {
  presetId: string;
  values: Record<string, unknown>;
}

/** One clip placed on a track. */
export interface TimelineClip {
  id: string;
  /** The beat this clip covers (empty for manually added clips). */
  beatId?: string;
  source: ClipSource;
  /** Position on the project clock. */
  range: TimeRange;
  /** Optional user label shown in the editor. */
  label?: string;
  /** Flagged (yellow outline) when a match scored below threshold. */
  review?: boolean;
  /** Match score (0..1 cosine) recorded by the matching pipeline. */
  matchScore?: number;
  /** Look preset applied to this clip (id is for the UI, chain for ffmpeg). */
  lookId?: string;
  look?: string;
  /** Set when the clip is a composed shot — lets the editor re-render it. */
  shotSpec?: ShotSpec;
  /** Playback gain for audio clips (1 = unity). */
  gain?: number;
}

export type TrackKind = 'video' | 'overlay' | 'audio' | 'captions';

/** An ordered lane of non-overlapping clips. */
export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  clips: TimelineClip[];
  muted?: boolean;
  locked?: boolean;
}

/** A caption cue (burned in or exported as sidecar). */
export interface CaptionCue {
  id: string;
  text: string;
  range: TimeRange;
}

/** The full timeline / EDL for one project. */
export interface Timeline {
  id: string;
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  /** Path to the narration audio the timeline is aligned to. */
  audioPath?: string;
  tracks: Track[];
  captions: CaptionCue[];
}

/** A saved editor project (timeline + provenance). */
export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  timeline: Timeline;
  transcript?: Transcript;
  beats?: Beat[];
  /** The pipeline run this project came from — enables "fill missing footage". */
  runId?: string;
}
