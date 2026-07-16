/**
 * Stage 1 — segmentation: script or transcript -> beats.
 *
 * A beat is the smallest visual unit (one clip per beat). Uses the LLM to find
 * natural visual boundaries; falls back to sentence/duration splitting when the
 * LLM is unavailable. Beats longer than settings.maxBeatSec are split.
 */

import type { Beat, PipelineSettings, Transcript, Word } from '@deep-video/shared';
import type { LLMClient } from './llm.js';
import { tryLlmJson } from './llm.js';
import { estimateSpeechSec, splitSentences, uid } from './text.js';

export async function segmentIntoBeats(input: {
  /** Raw script text (when the user typed a script)... */
  script?: string;
  /** ...or a timed transcript (when the user provided audio). */
  transcript?: Transcript;
  llm: LLMClient;
  settings: PipelineSettings;
}): Promise<Beat[]> {
  const { script, transcript, llm, settings } = input;
  if (!script && !transcript) throw new Error('stage1: need a script or a transcript');

  const sentences = transcript
    ? sentencesFromTranscript(transcript)
    : splitSentences(script ?? '').map((text) => ({ text, words: undefined }));
  if (sentences.length === 0) throw new Error('stage1: input contained no sentences');

  // Optional LLM pass: merge sentences into visually coherent groups.
  // Any failure (offline, bad JSON) falls through to one-beat-per-sentence.
  const groups =
    (await tryLlmGroups(llm, sentences.map((s) => s.text))) ??
    sentences.map((_, i) => [i]);

  const beats: Beat[] = [];
  let clock = 0;
  for (const group of groups) {
    const members = group.map((i) => sentences[i]).filter(Boolean);
    if (members.length === 0) continue;
    const text = members.map((m) => m.text).join(' ');
    const words = members.flatMap((m) => m.words ?? []);

    let startSec: number;
    let endSec: number;
    if (words.length > 0) {
      startSec = words[0].startSec;
      endSec = words[words.length - 1].endSec;
    } else {
      startSec = clock;
      endSec = clock + estimateSpeechSec(text);
    }
    clock = endSec;

    beats.push(...splitLongBeat({ text, startSec, endSec, words }, settings.maxBeatSec));
  }
  return beats;
}

/* -------------------------------- internals ------------------------------- */

interface SentenceSpan {
  text: string;
  words?: Word[];
}

/** Group transcript words into sentences at punctuation or pauses > 0.6s. */
function sentencesFromTranscript(t: Transcript): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    spans.push({ text: cur.map((w) => w.text).join(' ').trim(), words: cur });
    cur = [];
  };
  for (let i = 0; i < t.words.length; i++) {
    const w = t.words[i];
    cur.push(w);
    const next = t.words[i + 1];
    const punct = /[.!?…]$/.test(w.text.trim());
    const pause = next ? next.startSec - w.endSec > 0.6 : true;
    if (punct || pause) flush();
  }
  flush();
  return spans.filter((s) => s.text.length > 0);
}

/** Split a beat longer than maxSec into near-equal pieces on word boundaries. */
function splitLongBeat(
  b: { text: string; startSec: number; endSec: number; words: Word[] },
  maxSec: number,
): Beat[] {
  const dur = b.endSec - b.startSec;
  const pieces = Math.max(1, Math.ceil(dur / maxSec));
  if (pieces === 1) {
    return [
      {
        id: uid('beat'),
        text: b.text,
        range: { startSec: b.startSec, endSec: b.endSec },
      },
    ];
  }

  const beats: Beat[] = [];
  if (b.words.length > 0) {
    // Cut on the word whose end crosses each even time boundary.
    const step = dur / pieces;
    let piece: Word[] = [];
    let cut = b.startSec + step;
    const flush = () => {
      if (piece.length === 0) return;
      beats.push({
        id: uid('beat'),
        text: piece.map((w) => w.text).join(' ').trim(),
        range: { startSec: piece[0].startSec, endSec: piece[piece.length - 1].endSec },
      });
      piece = [];
    };
    for (const w of b.words) {
      piece.push(w);
      if (w.endSec >= cut - 1e-9 && beats.length < pieces - 1) {
        flush();
        cut += step;
      }
    }
    flush();
  } else {
    const tokens = b.text.split(/\s+/).filter(Boolean);
    const per = Math.ceil(tokens.length / pieces);
    const step = dur / pieces;
    for (let p = 0; p < pieces; p++) {
      const chunk = tokens.slice(p * per, (p + 1) * per);
      if (chunk.length === 0) break;
      beats.push({
        id: uid('beat'),
        text: chunk.join(' '),
        range: { startSec: b.startSec + p * step, endSec: b.startSec + (p + 1) * step },
      });
    }
  }
  return beats;
}

/**
 * Ask the LLM to group sentence indices into visual beats. Returns null when
 * the LLM is unreachable or answers with something unusable.
 */
async function tryLlmGroups(llm: LLMClient, sentences: string[]): Promise<number[][] | null> {
  if (sentences.length < 2) return null;
  const list = sentences.map((s, i) => `${i}: ${s}`).join('\n');
  return tryLlmJson(
    llm,
    'You segment narration into visual beats for a video editor. Group consecutive sentence ' +
      'indices that should share one shot. Reply with JSON: {"groups": [[0],[1,2],...]} covering ' +
      'every index exactly once, in order.',
    list,
    (parsed) => {
      const groups = (parsed as { groups?: unknown }).groups;
      if (!Array.isArray(groups)) return null;
      const flat: number[] = [];
      for (const g of groups) {
        if (!Array.isArray(g)) return null;
        for (const i of g) {
          if (typeof i !== 'number' || i !== flat.length) return null; // must be 0..n-1 in order
          flat.push(i);
        }
      }
      return flat.length === sentences.length ? (groups as number[][]) : null;
    },
    15_000,
  );
}
