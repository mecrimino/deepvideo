/**
 * Small text utilities shared by the pipeline stages. Pure, deterministic,
 * dependency-free — these are the heuristic fallbacks used when no LLM is
 * reachable, and pre-processing for queries when one is.
 */

/** Opaque-id generator (nanoid-style, no deps). */
export function uid(prefix = ''): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return prefix ? `${prefix}_${id}` : id;
}

/** Split prose into sentences (handles ., !, ?, …, newlines; keeps text). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?…])\s+|\n{2,}|\n(?=[-*•\d])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Average narration pace used to estimate durations for script-only input. */
export const WORDS_PER_SEC = 2.6;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Estimated seconds to narrate `text` (clamped to a sane minimum). */
export function estimateSpeechSec(text: string): number {
  return Math.max(1.2, countWords(text) / WORDS_PER_SEC);
}

const STOPWORDS = new Set(
  (
    'a an the and or but nor of in on at to for from by with without into onto over under ' +
    'is are was were be been being am do does did done doing have has had having will would ' +
    'shall should can could may might must it its this that these those there here he she ' +
    'they them his her their our your my me we you i as if then than so such not no yes ' +
    'about above after again against all any because before below between both down during ' +
    'each few more most other some only own same too very just also when where which who ' +
    'whom why how what while out up off once'
  ).split(/\s+/),
);

/** Lowercased content words (stopwords stripped, punctuation removed). */
export function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Deduplicated keywords, most frequent first. */
export function topKeywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const w of keywords(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}
