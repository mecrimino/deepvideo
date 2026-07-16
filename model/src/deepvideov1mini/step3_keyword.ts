/**
 * Step 3 — niche-aware keyword extraction (once per segment).
 * Prompt 2 with {{NICHE}} + {{SCRIPT_SEGMENT}} → one 2-4 word stock-search
 * phrase. The niche steers "senior woman kitchen counter" instead of a
 * generic "woman kitchen counter".
 */

import { topKeywords } from '../text.js';
import { KEYWORD_PROMPT } from './config.js';
import type { MiniLLM, MiniSegment } from './types.js';

/** Enforce the prompt's output contract: short phrase, no punctuation. */
export function sanitizeKeyword(raw: string, fallbackText: string): string {
  const cleaned = raw
    .split('\n')[0]
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .slice(0, 5)
    .join(' ');
  if (cleaned.length >= 3) return cleaned;
  return heuristicKeyword(fallbackText);
}

/** No-LLM fallback: top content words of the segment. */
export function heuristicKeyword(segmentText: string): string {
  return topKeywords(segmentText, 3).join(' ') || segmentText.split(/\s+/).slice(0, 3).join(' ');
}

/**
 * Extract the keyword for one segment. Tries the primary LLM (OpenRouter),
 * then the fallback LLM (Groq), then the deterministic heuristic — a segment
 * never ends up without a searchable keyword.
 */
export async function extractKeyword(
  niche: string,
  segment: MiniSegment,
  llm: MiniLLM,
  fallbackLLM?: MiniLLM,
): Promise<string> {
  const prompt = KEYWORD_PROMPT.replace('{{NICHE}}', niche).replace(
    '{{SCRIPT_SEGMENT}}',
    segment.text,
  );
  for (const client of [llm, fallbackLLM]) {
    if (!client) continue;
    try {
      const raw = await client.complete(prompt, { temperature: 0.3, timeoutMs: 30_000 });
      const kw = sanitizeKeyword(raw, segment.text);
      if (kw) return kw;
    } catch {
      // try the next client
    }
  }
  return heuristicKeyword(segment.text);
}
