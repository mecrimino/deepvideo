/**
 * Stage 2 — query building: beat -> search queries.
 *
 * For each beat the LLM derives two queries that live in CLIP's shared space:
 *   said  — semantic content of the narration ("the pilot breaks the record")
 *   shown — the desired imagery ("fighter jet afterburner close-up, dusk sky")
 * Both are embedded and used by stage3/stage4. When the LLM is unreachable a
 * keyword heuristic produces serviceable queries instead.
 */

import type { Beat, BeatQueries } from '@deep-video/shared';
import type { LLMClient } from './llm.js';
import { tryLlmJson } from './llm.js';
import { topKeywords } from './text.js';

export async function buildQueries(input: {
  beats: Beat[];
  llm: LLMClient;
}): Promise<Map<string, BeatQueries>> {
  const { beats, llm } = input;
  const out = new Map<string, BeatQueries>();

  const fromLlm = await tryLlmQueries(llm, beats);
  for (const beat of beats) {
    out.set(beat.id, fromLlm?.get(beat.id) ?? heuristicQueries(beat));
  }
  return out;
}

/* -------------------------------- internals ------------------------------- */

function heuristicQueries(beat: Beat): BeatQueries {
  const kw = topKeywords(beat.text, 8);
  return {
    said: beat.text,
    shown: kw.length > 0 ? `${kw.join(' ')} footage` : beat.text,
    keywords: kw,
  };
}

/** One batched LLM call for all beats; null on any failure. */
async function tryLlmQueries(
  llm: LLMClient,
  beats: Beat[],
): Promise<Map<string, BeatQueries> | null> {
  const list = beats.map((b, i) => `${i}: ${b.text}`).join('\n');
  const result = await tryLlmJson(
    llm,
    'You write stock-footage search queries for narration beats. For each numbered beat reply ' +
      'with what is SAID (a short semantic summary) and what should be SHOWN (a concrete visual ' +
      'description: subject, setting, camera). JSON: {"queries": [{"i": 0, "said": "...", ' +
      '"shown": "...", "keywords": ["..."]}, ...]} with one entry per beat.',
    list,
    (parsed) => {
      const arr = (parsed as { queries?: unknown }).queries;
      if (!Array.isArray(arr)) return null;
      const map = new Map<number, BeatQueries>();
      for (const q of arr) {
        const { i, said, shown, keywords: kw } = q as Record<string, unknown>;
        if (typeof i !== 'number' || typeof said !== 'string' || typeof shown !== 'string') {
          return null;
        }
        map.set(i, {
          said,
          shown,
          keywords: Array.isArray(kw) ? kw.filter((k): k is string => typeof k === 'string') : undefined,
        });
      }
      return map.size === beats.length ? map : null;
    },
    30_000,
  );
  if (!result) return null;
  const byId = new Map<string, BeatQueries>();
  beats.forEach((b, i) => {
    const q = result.get(i);
    if (q) byId.set(b.id, q);
  });
  return byId;
}
