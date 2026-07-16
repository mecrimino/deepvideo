/**
 * Caption handling: derive caption cues from the transcript (grouped to
 * readable line lengths) and export them as SRT/VTT for the render step.
 */

import type { CaptionCue, Transcript } from '@deep-video/shared';
import { NotImplementedError } from './types.js';

/** Group transcript words into caption cues (max chars/line, natural breaks). */
export function buildCaptions(_transcript: Transcript, _opts?: { maxChars?: number }): CaptionCue[] {
  throw new NotImplementedError('model/captions.buildCaptions');
}

/** Serialize cues to SRT for ffmpeg's subtitles filter. */
export function toSrt(_cues: CaptionCue[]): string {
  throw new NotImplementedError('model/captions.toSrt');
}

/** Serialize cues to WebVTT for the editor's <video> preview. */
export function toVtt(_cues: CaptionCue[]): string {
  throw new NotImplementedError('model/captions.toVtt');
}
