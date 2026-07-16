/**
 * Caption handling: derive caption cues from the transcript (grouped to
 * readable line lengths) and export them as SRT/VTT for the render step.
 */

import type { Beat, CaptionCue, Transcript } from '@deep-video/shared';
import { uid } from './text.js';

/** Group transcript words into caption cues (max chars/line, natural breaks). */
export function buildCaptions(transcript: Transcript, opts?: { maxChars?: number }): CaptionCue[] {
  const maxChars = opts?.maxChars ?? 42;
  const cues: CaptionCue[] = [];
  let text = '';
  let startSec = 0;

  const flush = (endSec: number) => {
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      cues.push({ id: uid('cue'), text: trimmed, range: { startSec, endSec } });
    }
    text = '';
  };

  for (let i = 0; i < transcript.words.length; i++) {
    const w = transcript.words[i];
    if (text.length === 0) startSec = w.startSec;
    text += (text.length > 0 ? ' ' : '') + w.text;

    const next = transcript.words[i + 1];
    const sentenceEnd = /[.!?…]$/.test(w.text.trim());
    const longPause = next ? next.startSec - w.endSec > 0.8 : true;
    const full = next ? text.length + 1 + next.text.length > maxChars : true;

    if (sentenceEnd || longPause || full) flush(w.endSec);
  }
  return cues;
}

/**
 * Caption cues for script-only projects (no word timings): one cue per beat,
 * long beats split into readable chunks spread evenly over the beat.
 */
export function captionsFromBeats(beats: Beat[], opts?: { maxChars?: number }): CaptionCue[] {
  const maxChars = opts?.maxChars ?? 42;
  const cues: CaptionCue[] = [];

  for (const beat of beats) {
    const words = beat.text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      if (line.length > 0 && line.length + 1 + w.length > maxChars) {
        lines.push(line);
        line = w;
      } else {
        line += (line.length > 0 ? ' ' : '') + w;
      }
    }
    if (line.length > 0) lines.push(line);

    const dur = beat.range.endSec - beat.range.startSec;
    const step = dur / Math.max(1, lines.length);
    lines.forEach((textLine, i) => {
      cues.push({
        id: uid('cue'),
        text: textLine,
        range: {
          startSec: beat.range.startSec + i * step,
          endSec: beat.range.startSec + (i + 1) * step,
        },
      });
    });
  }
  return cues;
}

/** Serialize cues to SRT for ffmpeg's subtitles filter. */
export function toSrt(cues: CaptionCue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${srtTime(cue.range.startSec)} --> ${srtTime(cue.range.endSec)}\n${cue.text}\n`,
    )
    .join('\n');
}

/** Serialize cues to WebVTT for the editor's <video> preview. */
export function toVtt(cues: CaptionCue[]): string {
  const body = cues
    .map((cue) => `${vttTime(cue.range.startSec)} --> ${vttTime(cue.range.endSec)}\n${cue.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/* -------------------------------- internals ------------------------------- */

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function clockParts(sec: number): { h: number; m: number; s: number; ms: number } {
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return { h, m, s, ms };
}

function srtTime(sec: number): string {
  const { h, m, s, ms } = clockParts(sec);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function vttTime(sec: number): string {
  const { h, m, s, ms } = clockParts(sec);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}
