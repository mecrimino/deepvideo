/**
 * Optional API keys. Deep Video v1 is 100% local — every key here stays empty.
 * This file exists so a later cloud upgrade (e.g. swapping llm.ts to Claude)
 * has one obvious place to read credentials from, always via process.env.
 */

export const keys = {
  /** Anthropic key — only for the future Claude-backed LLMClient. */
  anthropic: process.env.ANTHROPIC_API_KEY ?? '',
  /** Stock-footage APIs (Pexels etc.) if remote search is ever enabled. */
  pexels: process.env.PEXELS_API_KEY ?? '',
} as const;

/** True when running fully local (the v1 default). */
export const isLocalMode = Object.values(keys).every((k) => k === '');
