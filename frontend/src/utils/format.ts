/** Pure time/format helpers. */

/** Seconds -> "m:ss" (e.g. 134 -> "2:14"). */
export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Seconds -> "hh:mm:ss" transport timecode (e.g. "08:44:21"). */
export function formatTimecode(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Seconds -> ruler label like "8m 20s". */
export function formatRulerLabel(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}m ${s}s`;
}

/** Average narration pace (matches the model package's estimator). */
const WORDS_PER_SEC = 2.6;

/** Estimated video length in seconds from a script or attached audio. */
export function estimateLengthSec(input: { script?: string; audioDurationSec?: number }): number {
  if (input.audioDurationSec && input.audioDurationSec > 0) return input.audioDurationSec;
  const words = (input.script ?? '').split(/\s+/).filter(Boolean).length;
  // Short idea prompts get expanded to a ~150-word script by the model.
  return Math.max(words, 150) / WORDS_PER_SEC;
}
