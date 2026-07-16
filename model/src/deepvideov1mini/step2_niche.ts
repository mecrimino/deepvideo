/**
 * Step 2 — niche detection (once per project).
 * First NICHE_INPUT_CHARS characters of the full text → Prompt 1 → a 1-3 word
 * niche. Cached by the orchestrator and reused for every Step 3 call.
 */

import { NICHE_INPUT_CHARS, NICHE_PROMPT } from './config.js';
import type { MiniLLM } from './types.js';

/** Enforce the prompt's output contract: ≤3 words, no punctuation. */
export function sanitizeNiche(raw: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
  return cleaned || 'General';
}

export async function detectNiche(fullText: string, llm: MiniLLM): Promise<string> {
  const excerpt = fullText.slice(0, NICHE_INPUT_CHARS);
  try {
    const raw = await llm.complete(NICHE_PROMPT.replace('{{SCRIPT}}', excerpt), {
      temperature: 0,
      timeoutMs: 30_000,
    });
    return sanitizeNiche(raw);
  } catch {
    return 'General';
  }
}
