/**
 * Step 1 — segmentation into clause-boundary segments.
 *
 * Rules from the spec: break on sentence-ending punctuation, on a comma
 * followed by a conjunction, on a silence gap > PAUSE_GAP_SEC, and hard-cap a
 * segment at MAX_SEG_SEC so each segment stays one complete, searchable
 * visual idea.
 *
 * Two entry points:
 *  - segmentTranscriptWords(words) — timed words from whisper (audio input).
 *  - segmentScript(script)         — script-only input; timings estimated at
 *    narration pace so the timeline still lines up sensibly.
 */

import type { Word } from '@deep-video/shared';
import { uid, estimateSpeechSec, splitSentences } from '../text.js';
import { CONJUNCTIONS, MAX_SEG_SEC, PAUSE_GAP_SEC } from './config.js';
import type { MiniSegment } from './types.js';

function flush(words: Word[], startSec: number, endSec: number): MiniSegment {
  return {
    id: uid('seg'),
    text: words.map((w) => w.text.trim()).join(' ').trim(),
    startSec: Math.round(startSec * 100) / 100,
    endSec: Math.round(endSec * 100) / 100,
  };
}

/** Segments shorter than this merge into a neighbor (no flash-frame clips). */
const MIN_SEG_SEC = 1.0;

/** Merge sub-second fragments into the following (or previous) segment. */
function mergeShortSegments(segments: MiniSegment[]): MiniSegment[] {
  const out: MiniSegment[] = [];
  let carry: MiniSegment | null = null;
  for (const seg of segments) {
    const withCarry: MiniSegment = carry
      ? { ...seg, id: carry.id, text: `${carry.text} ${seg.text}`.trim(), startSec: carry.startSec }
      : seg;
    carry = null;
    if (withCarry.endSec - withCarry.startSec < MIN_SEG_SEC) {
      carry = withCarry;
    } else {
      out.push(withCarry);
    }
  }
  if (carry) {
    const last = out.pop();
    out.push(
      last
        ? { ...last, text: `${last.text} ${carry.text}`.trim(), endSec: carry.endSec }
        : carry,
    );
  }
  return out;
}

/**
 * Spec segmenter over whisper word timestamps — with one deliberate deviation:
 * a silence gap starts the new segment BEFORE the current word (the spec's
 * reference code flushes after it, which turns the first word following any
 * pause into an orphan 0.1s segment — exactly the "broken fragment" the spec
 * says to avoid). Sub-second fragments are merged into their neighbor.
 */
export function segmentTranscriptWords(words: Word[]): MiniSegment[] {
  const out: MiniSegment[] = [];
  let cur: Word[] = [];
  let segStart: number | null = null;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prevEnd = i > 0 ? words[i - 1].endSec : w.startSec;
    const gap = w.startSec - prevEnd;

    // Long pause: close the running segment at the pause, before this word.
    if (gap > PAUSE_GAP_SEC && cur.length && segStart !== null) {
      out.push(flush(cur, segStart, prevEnd));
      cur = [];
      segStart = null;
    }

    if (segStart === null) segStart = w.startSec;
    cur.push(w);

    const text = w.text.trim();
    const next = i + 1 < words.length ? words[i + 1].text.trim().toLowerCase() : '';
    const boundary =
      /[.?!]$/.test(text) ||
      (text.endsWith(',') && CONJUNCTIONS.has(next)) ||
      w.endSec - segStart >= MAX_SEG_SEC;

    if (boundary && cur.length) {
      out.push(flush(cur, segStart, w.endSec));
      cur = [];
      segStart = null;
    }
  }
  if (cur.length && segStart !== null) {
    out.push(flush(cur, segStart, cur[cur.length - 1].endSec));
  }
  return mergeShortSegments(out.filter((s) => s.text.length > 0));
}

/** Split one sentence into clauses on ", <conjunction>" boundaries. */
function splitClauses(sentence: string): string[] {
  const conj = [...CONJUNCTIONS].join('|');
  return sentence
    .split(new RegExp(`,\\s+(?=(?:${conj})\\b)`, 'i'))
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Recursively split a clause whose narration would exceed the hard cap. */
function capClause(clause: string): string[] {
  if (estimateSpeechSec(clause) <= MAX_SEG_SEC) return [clause];
  const words = clause.split(/\s+/);
  // prefer the comma nearest the middle; otherwise the word midpoint
  const commaIdxs = words.reduce<number[]>((acc, w, i) => (w.endsWith(',') ? [...acc, i] : acc), []);
  const mid = Math.floor(words.length / 2);
  const split = commaIdxs.length
    ? commaIdxs.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a))
    : mid - 1;
  const left = words.slice(0, split + 1).join(' ');
  const right = words.slice(split + 1).join(' ');
  return [...capClause(left), ...capClause(right)];
}

/** Script-only segmentation with estimated timings (no audio yet). */
export function segmentScript(script: string): MiniSegment[] {
  const clauses = splitSentences(script).flatMap(splitClauses).flatMap(capClause);
  const out: MiniSegment[] = [];
  let t = 0;
  for (const text of clauses) {
    const dur = Math.min(MAX_SEG_SEC, estimateSpeechSec(text));
    out.push({
      id: uid('seg'),
      text,
      startSec: Math.round(t * 100) / 100,
      endSec: Math.round((t + dur) * 100) / 100,
    });
    t += dur;
  }
  return out.filter((s) => s.text.length > 0);
}
