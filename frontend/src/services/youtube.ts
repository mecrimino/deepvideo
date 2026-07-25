/**
 * YouTube Data API v3 — resolve a pasted channel URL / @handle / UC-id into
 * real channel data (title, thumbnail, subscribers). Uses the primary key and
 * rotates to the backup on quota/auth errors. Callers cache results locally —
 * see utils/channel.ts — so the API is hit as rarely as possible.
 */

export interface YtChannel {
  id: string;
  title: string;
  handle: string;
  thumb: string;
  subscribers: number;
}

const KEYS = [
  import.meta.env.VITE_YOUTUBE_API_KEY,
  import.meta.env.VITE_YOUTUBE_API_KEY_BACKUP,
].filter(Boolean) as string[];

/** Accepts: channel URL (/channel/UC…, /@handle, /user/name), bare UC-id, @handle, or plain handle. */
function parseInput(raw: string): { id?: string; handle?: string; username?: string } {
  const s = raw.trim();
  const url = s.match(/youtube\.com\/(channel\/(UC[\w-]{22})|@([\w.-]+)|user\/([\w.-]+)|c\/([\w.-]+))/i);
  if (url) {
    if (url[2]) return { id: url[2] };
    if (url[3]) return { handle: url[3] };
    if (url[4]) return { username: url[4] };
    if (url[5]) return { handle: url[5] };
  }
  if (/^UC[\w-]{22}$/.test(s)) return { id: s };
  if (s.startsWith('@')) return { handle: s.slice(1) };
  return { handle: s };
}

async function request(params: Record<string, string>): Promise<YtChannel> {
  let lastErr: Error = new Error('No YouTube API key configured');
  for (const key of KEYS) {
    const qs = new URLSearchParams({ part: 'snippet,statistics', key, ...params });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${qs}`);
    if (res.status === 403 || res.status === 429) {
      lastErr = new Error('YouTube API quota exceeded');
      continue; // rotate to the backup key
    }
    if (!res.ok) throw new Error(`YouTube API error ${res.status}`);
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) throw new Error('Channel not found — check the URL or ID');
    return {
      id: item.id,
      title: item.snippet?.title ?? '',
      handle: item.snippet?.customUrl ?? '',
      thumb: item.snippet?.thumbnails?.default?.url ?? '',
      subscribers: Number(item.statistics?.subscriberCount ?? 0),
    };
  }
  throw lastErr;
}

/** Resolve whatever the user pasted into a real channel. */
export function resolveChannel(input: string): Promise<YtChannel> {
  const q = parseInput(input);
  if (q.id) return request({ id: q.id });
  if (q.username) return request({ forUsername: q.username });
  return request({ forHandle: q.handle! });
}

/** Refresh a known channel's stats by id (the daily 7 o'clock refresh). */
export function fetchChannelById(id: string): Promise<YtChannel> {
  return request({ id });
}

export function fmtSubscribers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(n);
}
