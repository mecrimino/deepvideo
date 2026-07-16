/**
 * Timeline -> video render with ffmpeg/ffprobe via child_process.
 * ffmpeg must be on PATH (reported by /api/health).
 *
 * Strategy: render each video-track clip (and each gap / generation slot) to a
 * normalized intermediate segment (same size/fps/codec, with audio), then
 * concat-demux the segments, optionally mix the narration track over the
 * result, and burn captions with the subtitles filter. Per-segment encoding
 * keeps failures isolated and gives real progress numbers.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { RenderResponse, Timeline, TimelineClip } from '@deep-video/shared';
import { toSrt, uid } from '@deep-video/model';
import { EXPORTS_DIR, TMP_DIR, fromDataRelative } from './paths.js';

const run = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

/** True when ffmpeg/ffprobe answer on this machine. */
export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(FFMPEG, ['-version']);
    await run(FFPROBE, ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** ffprobe a media file. */
export async function probe(filePath: string): Promise<ProbeResult> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: {
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      duration?: string;
    }[];
  };
  const video = data.streams?.find((s) => s.codec_type === 'video');
  const audio = data.streams?.find((s) => s.codec_type === 'audio');

  let fps = 30;
  if (video?.r_frame_rate) {
    const [num, den] = video.r_frame_rate.split('/').map(Number);
    if (num && den) fps = num / den;
  }
  const durationSec = Number(data.format?.duration ?? video?.duration ?? audio?.duration ?? 0) || 0;

  return {
    durationSec,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps,
    hasAudio: Boolean(audio),
  };
}

/** Extract poster frames at the given timestamps; returns image paths. */
export async function extractFrames(filePath: string, timesSec: number[]): Promise<string[]> {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const out: string[] = [];
  for (const t of timesSec) {
    const dest = path.join(TMP_DIR, `frame_${uid()}.jpg`);
    await run(FFMPEG, [
      '-y',
      '-ss', String(Math.max(0, t)),
      '-i', filePath,
      '-frames:v', '1',
      '-vf', 'scale=320:-2',
      '-q:v', '4',
      dest,
    ]);
    out.push(dest);
  }
  return out;
}

/** Extract one poster frame to an explicit destination (library thumbnails). */
export async function extractThumb(filePath: string, tSec: number, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const isImage = /\.(png|jpe?g|webp|bmp|gif)$/i.test(filePath);
  const args = isImage
    ? ['-y', '-i', filePath, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', dest]
    : ['-y', '-ss', String(Math.max(0, tSec)), '-i', filePath, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', dest];
  await run(FFMPEG, args);
}

export interface RenderProgress {
  /** 0..1 across segment encoding + final mux. */
  progress: number;
  message: string;
}

/** Render a timeline to an mp4 under DATA_DIR/exports/. */
export async function renderTimeline(
  timeline: Timeline,
  opts?: {
    format?: 'mp4' | 'mov';
    onProgress?: (p: RenderProgress) => void;
    /** Resolve a ClipAsset id to its media path (DATA_DIR-relative or absolute). */
    resolveAsset?: (assetId: string) => string | undefined;
  },
): Promise<RenderResponse> {
  const onProgress = opts?.onProgress ?? (() => {});
  const resolveAsset = opts?.resolveAsset ?? ((id: string) => id);
  const W = timeline.width || 1280;
  const H = timeline.height || 720;
  const FPS = Math.round(timeline.fps || 30);

  const jobDir = path.join(TMP_DIR, `render_${uid()}`);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.mkdir(EXPORTS_DIR, { recursive: true });

  try {
    const video = timeline.tracks.find((t) => t.kind === 'video');
    const clips = [...(video?.clips ?? [])].sort((a, b) => a.range.startSec - b.range.startSec);
    const totalSec = Math.max(
      timeline.durationSec,
      clips.length > 0 ? clips[clips.length - 1].range.endSec : 0,
    );
    if (totalSec <= 0) throw new Error('timeline is empty — nothing to render');

    // ---- plan segments: clips, and black filler for gaps/slots ----
    interface Segment {
      startSec: number;
      durSec: number;
      clip?: TimelineClip;
    }
    const segments: Segment[] = [];
    let cursor = 0;
    for (const clip of clips) {
      if (clip.range.startSec > cursor + 0.01) {
        segments.push({ startSec: cursor, durSec: clip.range.startSec - cursor });
      }
      segments.push({
        startSec: clip.range.startSec,
        durSec: clip.range.endSec - clip.range.startSec,
        clip,
      });
      cursor = Math.max(cursor, clip.range.endSec);
    }
    if (totalSec > cursor + 0.01) segments.push({ startSec: cursor, durSec: totalSec - cursor });

    // ---- encode each segment to a normalized intermediate ----
    const segFiles: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const dest = path.join(jobDir, `seg_${String(i).padStart(3, '0')}.mp4`);
      onProgress({
        progress: (i / (segments.length + 1)) * 0.85,
        message: `Encoding segment ${i + 1}/${segments.length}`,
      });
      await encodeSegment(seg.clip, seg.durSec, dest, { W, H, FPS }, resolveAsset);
      segFiles.push(dest);
    }

    // ---- concat + narration + captions ----
    onProgress({ progress: 0.87, message: 'Joining segments' });
    const listFile = path.join(jobDir, 'segments.txt');
    await fs.writeFile(
      listFile,
      segFiles.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'),
      'utf8',
    );

    let srtFile: string | null = null;
    if (timeline.captions.length > 0) {
      srtFile = path.join(jobDir, 'captions.srt');
      await fs.writeFile(srtFile, toSrt(timeline.captions), 'utf8');
    }

    const outName = `export_${uid()}.${opts?.format ?? 'mp4'}`;
    const outPath = path.join(EXPORTS_DIR, outName);
    const narration = timeline.audioPath ? fromDataRelative(timeline.audioPath) : null;

    const finalArgs = buildFinalArgs({ listFile, srtFile, narration, outPath, totalSec });
    try {
      await run(FFMPEG, finalArgs, { maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
      // The subtitles filter can fail on machines without fontconfig — retry
      // without captions rather than failing the whole export.
      if (!srtFile) throw err;
      const plain = buildFinalArgs({ listFile, srtFile: null, narration, outPath, totalSec });
      await run(FFMPEG, plain, { maxBuffer: 64 * 1024 * 1024 });
    }

    onProgress({ progress: 1, message: 'Done' });
    return { outputPath: `exports/${outName}`, durationSec: totalSec };
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* -------------------------------- internals ------------------------------- */

interface Dims {
  W: number;
  H: number;
  FPS: number;
}

/** Encode one normalized segment: real footage, still image, or filler card. */
async function encodeSegment(
  clip: TimelineClip | undefined,
  durSec: number,
  dest: string,
  { W, H, FPS }: Dims,
  resolveAsset: (assetId: string) => string | undefined,
): Promise<void> {
  const dur = Math.max(0.05, durSec);
  const scalePad =
    `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS}`;
  const encode = [
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    '-t', String(dur),
    dest,
  ];

  const resolved = clip && clip.source.kind === 'asset' ? resolveAsset(clip.source.assetId) : undefined;
  if (clip && clip.source.kind === 'asset' && resolved) {
    const src = fromDataRelative(resolved);
    const isImage = /\.(png|jpe?g|webp|bmp|gif)$/i.test(src);
    if (isImage) {
      await run(FFMPEG, [
        '-y',
        '-loop', '1', '-t', String(dur), '-i', src,
        '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-shortest',
        '-vf', scalePad,
        ...encode,
      ]);
      return;
    }
    const inSec = clip.source.kind === 'asset' ? clip.source.inSec : 0;
    const hasAudio = await probe(src).then((p) => p.hasAudio).catch(() => false);
    if (hasAudio) {
      await run(FFMPEG, [
        '-y',
        '-ss', String(Math.max(0, inSec)),
        '-i', src,
        '-vf', scalePad,
        ...encode,
      ]);
    } else {
      await run(FFMPEG, [
        '-y',
        '-ss', String(Math.max(0, inSec)),
        '-i', src,
        '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-map', '0:v:0', '-map', '1:a:0',
        '-vf', scalePad,
        ...encode,
      ]);
    }
    return;
  }

  // Gap or GenerationSlot -> filler card (dark for gaps, deep violet for slots).
  const color = clip ? '0x2b2140' : 'black';
  await run(FFMPEG, [
    '-y',
    '-f', 'lavfi', '-t', String(dur), '-i', `color=c=${color}:s=${W}x${H}:r=${FPS}`,
    '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    ...encode,
  ]);
}

function buildFinalArgs(input: {
  listFile: string;
  srtFile: string | null;
  narration: string | null;
  outPath: string;
  totalSec: number;
}): string[] {
  const { listFile, srtFile, narration, outPath, totalSec } = input;
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile];
  if (narration) args.push('-i', narration);

  const filters: string[] = [];
  if (srtFile) {
    // ffmpeg filter escaping on Windows: forward slashes + escaped drive colon.
    const escaped = srtFile.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    filters.push(`subtitles='${escaped}'`);
  }
  if (filters.length > 0) args.push('-vf', filters.join(','));

  if (narration) {
    args.push(
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:weights=0.4 1[aout]',
      '-map', '0:v', '-map', '[aout]',
    );
  }

  args.push(
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-t', String(totalSec),
    '-movflags', '+faststart',
    outPath,
  );
  return args;
}
