/**
 * Timeline -> video render with ffmpeg/ffprobe via child_process.
 * ffmpeg must be on PATH (checked at server startup; see index.ts /api/health).
 *
 * TODO(implement):
 *  - probe(path): ffprobe -print_format json (duration, streams, fps)
 *  - extractFrames(path, times[]): sample poster frames for CLIP indexing
 *  - renderTimeline(timeline): build an ffmpeg filter_complex (trim/scale/
 *    concat per video track clip, overlay track on top, amix narration+music,
 *    subtitles filter for captions) and encode H.264/AAC into
 *    DATA_DIR/exports/<id>.mp4. GenerationSlots render as labeled color cards.
 */

import type { RenderResponse, Timeline } from '@deep-video/shared';

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

/** ffprobe a media file. */
export async function probe(_path: string): Promise<ProbeResult> {
  throw new Error('TODO(server/render.probe): not implemented — see server/CLAUDE.md');
}

/** Extract poster frames at the given timestamps; returns image paths. */
export async function extractFrames(_path: string, _timesSec: number[]): Promise<string[]> {
  throw new Error('TODO(server/render.extractFrames): not implemented — see server/CLAUDE.md');
}

/** Render a timeline to an mp4 under DATA_DIR/exports/. */
export async function renderTimeline(_timeline: Timeline): Promise<RenderResponse> {
  throw new Error('TODO(server/render.renderTimeline): not implemented — see server/CLAUDE.md');
}
