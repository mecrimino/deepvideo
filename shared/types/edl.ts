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
  /** Per-word timings when the transcript had them (drives word-by-word styles). */
  words?: Word[];
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
  /** Burn-in caption style; ids match core/agents/exporter/caption_styles.py. */
  captionStyle?: CaptionStyleId;
  /** Per-project overrides on top of that style. */
  captionOptions?: CaptionOptions;
}

/** Caption burn-in styles offered in the editor. */
export type CaptionStyleId =
  | 'classic' | 'outline' | 'pop' | 'banner' | 'minimal' | 'top'
  | 'live' | 'karaoke';

/** User tweaks layered over the chosen style preset. */
export interface CaptionOptions {
  /** Text height as a percentage of the frame (e.g. 5 = 5% of height). */
  sizePct?: number;
  /** Hex fill, e.g. "#FFE14D". */
  color?: string;
  place?: 'bottom' | 'middle' | 'top';
  upper?: boolean;
}

export const CAPTION_STYLES: { id: CaptionStyleId; label: string; hint: string }[] = [
  { id: 'classic', label: 'Classic', hint: 'White on a soft black box' },
  { id: 'outline', label: 'Bold outline', hint: 'Large white with a thick outline' },
  { id: 'pop', label: 'Yellow pop', hint: 'Impact caps in yellow' },
  { id: 'banner', label: 'Banner', hint: 'Wide dark bar across the bottom' },
  { id: 'minimal', label: 'Minimal', hint: 'Small white with a soft shadow' },
  { id: 'top', label: 'Top bar', hint: 'Boxed caption at the top' },
  { id: 'live', label: 'Live typing', hint: 'Words appear as they are spoken' },
  { id: 'karaoke', label: 'One word', hint: 'One big word at a time, centre screen' },
];

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
