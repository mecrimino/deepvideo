/**
 * Local media helpers — ffprobe wrapper + thumbnail extraction (Ch5 primitives).
 * ffmpeg/ffprobe are on PATH in this environment.
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { ROOT } from '../config/index.ts';

export interface MediaInfo {
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
  hasAudio: boolean;
}

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => res({ code: code ?? 0, stdout, stderr }));
    proc.on('error', () => res({ code: 1, stdout, stderr }));
  });
}

/** Repo-relative POSIX path (matches how the core stores asset paths). */
export function rel(abs: string): string {
  return relative(ROOT, abs).split('\\').join('/');
}

export async function probe(path: string): Promise<MediaInfo> {
  const { code, stdout } = await run('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', path,
  ]);
  const info: MediaInfo = { durationSec: 0, width: 0, height: 0, hasAudio: false };
  if (code !== 0) return info;
  try {
    const data = JSON.parse(stdout);
    info.durationSec = Number(data.format?.duration ?? 0) || 0;
    for (const s of data.streams ?? []) {
      if (s.codec_type === 'video' && info.width === 0) {
        info.width = Number(s.width ?? 0) || 0;
        info.height = Number(s.height ?? 0) || 0;
        const [n, d] = String(s.avg_frame_rate ?? '0/1').split('/');
        const fps = Number(n) / Number(d || 1);
        info.fps = Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : undefined;
        if (!info.durationSec) info.durationSec = Number(s.duration ?? 0) || 0;
      } else if (s.codec_type === 'audio') {
        info.hasAudio = true;
      }
    }
  } catch {
    /* ignore */
  }
  return info;
}

export async function makeThumbnail(src: string, dest: string, atSec = 1): Promise<string | null> {
  await mkdir(dirname(dest), { recursive: true });
  const { code } = await run('ffmpeg', [
    '-y', '-ss', String(Math.max(0, atSec)), '-i', src,
    '-frames:v', '1', '-q:v', '3', '-vf', 'scale=480:-2', dest,
  ]);
  return code === 0 ? dest : null;
}
