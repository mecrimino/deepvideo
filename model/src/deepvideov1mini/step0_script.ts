/**
 * Step 0 — script acquisition (Mini extension, not in the matching spec).
 * The matching pipeline expects a narration script. When the user typed a
 * short idea ("Create a space exploration story..."), write the script first;
 * when they pasted a full script, pass it through untouched.
 */

import { SCRIPT_PROMPT } from './config.js';
import type { MiniLLM } from './types.js';

/** Heuristic: short single-thought text is an idea, not a narration script. */
export function looksLikeIdea(text: string): boolean {
  const trimmed = text.trim();
  const sentences = trimmed.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
  return trimmed.length < 240 || sentences.length <= 2;
}

/** Strip cue tags like [HOOK] — reference-only, never spoken (per the spec). */
export function stripCueTags(script: string): string {
  return script
    .replace(/\[[^\]\n]{1,48}\]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Return the narration script for the project: the input itself when it is
 * already a script, otherwise an LLM-written one. Falls back to the raw input
 * if the LLM is unreachable so the pipeline still runs.
 */
export async function acquireScript(input: string, llm: MiniLLM): Promise<string> {
  const clean = stripCueTags(input);
  if (!looksLikeIdea(clean)) return clean;
  try {
    const written = await llm.complete(SCRIPT_PROMPT.replace('{{IDEA}}', clean), {
      temperature: 0.7,
      timeoutMs: 45_000,
    });
    const script = stripCueTags(written);
    return script.length >= 80 ? script : clean;
  } catch {
    return clean;
  }
}
