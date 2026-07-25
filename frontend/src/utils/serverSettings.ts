/**
 * Server-side settings mirror. localStorage stays the instant-load cache, but
 * every change is ALSO pushed to the gateway (projects/settings.json on disk),
 * so channels/brand/credits survive a browser-data wipe. All calls are silent
 * best-effort — with the server down the app still works off localStorage.
 */

export async function fetchServerSettings(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Fire-and-forget write of one settings key. */
export function pushServerSetting(key: string, value: unknown): void {
  void fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  }).catch(() => {});
}
