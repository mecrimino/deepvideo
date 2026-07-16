/**
 * EDL/timeline model operations. Pure functions over @deep-video/shared types —
 * no I/O here. The editor frontend mirrors some of these for optimistic updates.
 * Every function returns a NEW timeline; inputs are never mutated.
 */

import type { Beat, PickDecision, Timeline, TimelineClip, Track } from '@deep-video/shared';
import { uid } from './text.js';

/** Create an empty 16:9 timeline aligned to a narration audio file. */
export function createTimeline(opts: {
  audioPath?: string;
  durationSec: number;
  fps?: number;
}): Timeline {
  return {
    id: uid('tl'),
    fps: opts.fps ?? 30,
    width: 1280,
    height: 720,
    durationSec: opts.durationSec,
    audioPath: opts.audioPath,
    tracks: [
      { id: uid('trk'), kind: 'video', name: 'Video', clips: [] },
      { id: uid('trk'), kind: 'audio', name: 'Narration', clips: [] },
    ],
    captions: [],
  };
}

/**
 * Build the video track from stage5 pick decisions: one clip (or generation
 * placeholder) per beat, aligned to each beat's TimeRange.
 */
export function assembleFromPicks(
  timeline: Timeline,
  beats: Beat[],
  picks: PickDecision[],
): Timeline {
  const byBeat = new Map(picks.map((p) => [p.beatId, p]));
  const clips: TimelineClip[] = [];

  for (const beat of beats) {
    const pick = byBeat.get(beat.id);
    if (!pick) continue;
    const beatDur = beat.range.endSec - beat.range.startSec;

    if (pick.kind === 'retrieve') {
      const inSec = pick.candidate.inSec ?? 0;
      clips.push({
        id: uid('clip'),
        beatId: beat.id,
        source: {
          kind: 'asset',
          assetId: pick.candidate.clipId,
          inSec,
          outSec: pick.candidate.outSec ?? inSec + beatDur,
        },
        range: { ...beat.range },
        label: beat.text.slice(0, 60),
      });
    } else {
      clips.push({
        id: uid('clip'),
        beatId: beat.id,
        source: { kind: 'generate', slot: pick.slot },
        range: { ...beat.range },
        label: pick.slot.prompt.slice(0, 60),
      });
    }
  }

  const next = cloneTimeline(timeline);
  const video = next.tracks.find((t) => t.kind === 'video');
  if (!video) throw new Error('timeline has no video track');
  video.clips = clips.sort((a, b) => a.range.startSec - b.range.startSec);
  return recomputeDuration(next);
}

/** Insert a clip into a track, shifting/validating so clips never overlap. */
export function insertClip(timeline: Timeline, trackId: string, clip: TimelineClip): Timeline {
  const next = cloneTimeline(timeline);
  const track = next.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`track not found: ${trackId}`);

  const dur = clip.range.endSec - clip.range.startSec;
  if (dur <= 0) throw new Error('clip range must be positive');

  // Push the insertion point forward until it does not overlap an existing clip.
  let startSec = Math.max(0, clip.range.startSec);
  const sorted = [...track.clips].sort((a, b) => a.range.startSec - b.range.startSec);
  for (const existing of sorted) {
    if (startSec < existing.range.endSec && startSec + dur > existing.range.startSec) {
      startSec = existing.range.endSec;
    }
  }

  track.clips = [...track.clips, { ...clip, range: { startSec, endSec: startSec + dur } }].sort(
    (a, b) => a.range.startSec - b.range.startSec,
  );
  return recomputeDuration(next);
}

/** Remove a clip (leaves a gap; does not ripple). */
export function removeClip(timeline: Timeline, clipId: string): Timeline {
  const next = cloneTimeline(timeline);
  for (const track of next.tracks) {
    track.clips = track.clips.filter((c) => c.id !== clipId);
  }
  return recomputeDuration(next);
}

/** Trim a clip's in/out points and its range on the project clock. */
export function trimClip(
  timeline: Timeline,
  clipId: string,
  edit: { startSec?: number; endSec?: number },
): Timeline {
  const next = cloneTimeline(timeline);
  const found = findClip(next, clipId);
  if (!found) throw new Error(`clip not found: ${clipId}`);
  const { track, clip } = found;

  const startSec = edit.startSec ?? clip.range.startSec;
  const endSec = edit.endSec ?? clip.range.endSec;
  if (endSec - startSec < 0.1) throw new Error('clip would be shorter than 0.1s');

  // Keep the source in/out in sync with how much project time the clip covers.
  if (clip.source.kind === 'asset') {
    const src = clip.source;
    const newIn = src.inSec + (startSec - clip.range.startSec);
    const newOut = src.outSec + (endSec - clip.range.endSec);
    if (newIn < 0) throw new Error('trim before the start of the source clip');
    src.inSec = newIn;
    src.outSec = Math.max(newOut, newIn + 0.1);
  }

  clip.range = { startSec, endSec };

  // Refuse edits that make the clip overlap its neighbors on the same track.
  for (const other of track.clips) {
    if (other.id === clip.id) continue;
    if (clip.range.startSec < other.range.endSec && clip.range.endSec > other.range.startSec) {
      throw new Error('trim would overlap a neighboring clip');
    }
  }
  return recomputeDuration(next);
}

/** Replace the media behind a clip while keeping its position (swap pick). */
export function replaceClipSource(
  timeline: Timeline,
  clipId: string,
  source: TimelineClip['source'],
): Timeline {
  const next = cloneTimeline(timeline);
  const found = findClip(next, clipId);
  if (!found) throw new Error(`clip not found: ${clipId}`);
  found.clip.source = structuredClone(source);
  return next;
}

/** Recompute durationSec from the last clip end across all tracks. */
export function recomputeDuration(timeline: Timeline): Timeline {
  const next = cloneTimeline(timeline);
  let end = 0;
  for (const track of next.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.range.endSec);
  }
  for (const cue of next.captions) end = Math.max(end, cue.range.endSec);
  // Never shrink below the narration audio the timeline is aligned to.
  next.durationSec = Math.max(end, next.audioPath ? next.durationSec : 0);
  if (!next.audioPath) next.durationSec = end;
  return next;
}

/* -------------------------------- internals ------------------------------- */

function cloneTimeline(t: Timeline): Timeline {
  return structuredClone(t);
}

function findClip(
  timeline: Timeline,
  clipId: string,
): { track: Track; clip: TimelineClip } | null {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}
