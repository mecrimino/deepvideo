/**
 * EDL/timeline model operations. Pure functions over @deep-video/shared types —
 * no I/O here. The editor frontend mirrors some of these for optimistic updates.
 */

import type { Beat, PickDecision, Timeline, TimelineClip } from '@deep-video/shared';
import { NotImplementedError } from './types.js';

/** Create an empty 16:9 timeline aligned to a narration audio file. */
export function createTimeline(_opts: {
  audioPath?: string;
  durationSec: number;
  fps?: number;
}): Timeline {
  throw new NotImplementedError('model/timeline.createTimeline');
}

/**
 * Build the video track from stage5 pick decisions: one clip (or generation
 * placeholder) per beat, aligned to each beat's TimeRange.
 */
export function assembleFromPicks(
  _timeline: Timeline,
  _beats: Beat[],
  _picks: PickDecision[],
): Timeline {
  throw new NotImplementedError('model/timeline.assembleFromPicks');
}

/** Insert a clip into a track, shifting/validating so clips never overlap. */
export function insertClip(_timeline: Timeline, _trackId: string, _clip: TimelineClip): Timeline {
  throw new NotImplementedError('model/timeline.insertClip');
}

/** Remove a clip (leaves a gap; does not ripple). */
export function removeClip(_timeline: Timeline, _clipId: string): Timeline {
  throw new NotImplementedError('model/timeline.removeClip');
}

/** Trim a clip's in/out points and its range on the project clock. */
export function trimClip(
  _timeline: Timeline,
  _clipId: string,
  _edit: { startSec?: number; endSec?: number },
): Timeline {
  throw new NotImplementedError('model/timeline.trimClip');
}

/** Replace the media behind a clip while keeping its position (swap pick). */
export function replaceClipSource(
  _timeline: Timeline,
  _clipId: string,
  _source: TimelineClip['source'],
): Timeline {
  throw new NotImplementedError('model/timeline.replaceClipSource');
}

/** Recompute durationSec from the last clip end across all tracks. */
export function recomputeDuration(_timeline: Timeline): Timeline {
  throw new NotImplementedError('model/timeline.recomputeDuration');
}
