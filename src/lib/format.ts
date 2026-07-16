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
