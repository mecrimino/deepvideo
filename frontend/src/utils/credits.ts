/**
 * Local credits ledger — a real, persistent balance (localStorage), not a
 * hard-coded number. Generations deduct their estimated cost; the Home pill
 * and Setup screen read live values through useSyncExternalStore.
 */

import { fetchServerSettings, pushServerSetting } from './serverSettings';

const KEY = 'deepvideo.credits';
const STARTING_BALANCE = 1240;

const listeners = new Set<() => void>();

export function getCredits(): number {
  const raw = localStorage.getItem(KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : STARTING_BALANCE;
}

export function spendCredits(amount: number): number {
  const next = Math.max(0, Math.round(getCredits() - amount));
  localStorage.setItem(KEY, String(next));
  pushServerSetting('credits', next); // survives a browser-data wipe
  listeners.forEach((l) => l());
  return next;
}

// Hydrate the balance from the server (disk beats a wiped localStorage).
void fetchServerSettings().then((s) => {
  const remote = s?.credits;
  if (typeof remote === 'number' && Number.isFinite(remote)) {
    if (remote !== getCredits()) {
      localStorage.setItem(KEY, String(remote));
      listeners.forEach((l) => l());
    }
  } else if (localStorage.getItem(KEY) !== null) {
    pushServerSetting('credits', getCredits()); // seed the server once
  }
});

export function subscribeCredits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Average narration pace (matches the model package's estimator). */
const WORDS_PER_SEC = 2.6;

/** Estimated video length in seconds for the pending generation. */
export function estimateLengthSec(input: { script?: string; audioDurationSec?: number }): number {
  if (input.audioDurationSec && input.audioDurationSec > 0) return input.audioDurationSec;
  const words = (input.script ?? '').split(/\s+/).filter(Boolean).length;
  // Short idea prompts get expanded to a ~150-word script by the model.
  return Math.max(words, 150) / WORDS_PER_SEC;
}

/** Cost in credits: model rate (credits/min) × estimated minutes, rounded up. */
export function estimateCostCredits(rateCreditsPerMin: number, lengthSec: number): number {
  return Math.ceil((rateCreditsPerMin * lengthSec) / 60);
}
