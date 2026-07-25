/**
 * The user's YouTube channels — real data from the YouTube API, persisted in
 * localStorage so the app never re-requests on every load. Stats refresh at
 * most ONCE per day, after the 7 o'clock boundary, to protect the API quota.
 */

import { fetchChannelById, type YtChannel } from '../services/youtube';
import { fetchServerSettings, pushServerSetting } from './serverSettings';

/** Per-channel production settings — the brand profile (video-style setup). */
export interface BrandProfile {
  /** Video/narration language (matches Kokoro voice languages). */
  language: string;
  /** Kokoro TTS voice for narration. */
  voice: string;
  /** Index into data/themes (motion-template theme). */
  themeIdx: number;
  /** Footage preference: mixed | stock_video | stock_image | ai_image. */
  assetSource: 'mixed' | 'stock_video' | 'stock_image' | 'ai_image';
  /** Compliance: generate without motion graphics / captions / effects. */
  disableAnimations: boolean;
  disableOverlays: boolean;
  disableEffects: boolean;
  /** Motion-template types never to use (title, chart, map, kinetic, …). */
  blockedTemplates: string[];
  /** Background image (repo-relative path under assets/background_image). */
  background: string;
}

export const DEFAULT_BRAND: BrandProfile = {
  language: 'American English',
  voice: 'af_heart',
  themeIdx: 4, // Standard theme
  assetSource: 'mixed',
  disableAnimations: false,
  disableOverlays: false,
  disableEffects: false,
  blockedTemplates: [],
  background: '',
};

export interface Channel extends YtChannel {
  /** User-declared content niche (mandatory when adding). */
  niche: string;
  /** When this channel's stats were last fetched (ms epoch). */
  fetchedAt: number;
  /** The channel's brand profile (defaults applied for older saves). */
  brand?: BrandProfile;
}

/** A channel's brand profile with defaults filled in (older saves lack it). */
export function brandOf(ch: Channel | null): BrandProfile {
  return { ...DEFAULT_BRAND, ...(ch?.brand ?? {}) };
}

interface ChannelState {
  channels: Channel[];
  activeId: string | null;
}

const KEY = 'deepvideo.channels';
const listeners = new Set<() => void>();

function load(): ChannelState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as ChannelState;
      if (Array.isArray(s.channels)) return s;
    }
  } catch {
    /* corrupted — start fresh */
  }
  return { channels: [], activeId: null };
}

// Cached snapshot — useSyncExternalStore needs a stable reference.
let state: ChannelState = load();

function persist(next: ChannelState, { push = true }: { push?: boolean } = {}): void {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  // Mirror to the server (projects/settings.json) so channels survive a
  // browser-data wipe. Local-only when adopting server state (no echo).
  if (push) pushServerSetting('channels', next);
  listeners.forEach((l) => l());
}

// Hydrate from the server: disk beats a wiped localStorage. If the server has
// nothing but this browser does (pre-existing install), seed the server.
void fetchServerSettings().then((s) => {
  const remote = s?.channels as ChannelState | undefined;
  if (remote && Array.isArray(remote.channels) && remote.channels.length > 0) {
    if (JSON.stringify(remote) !== JSON.stringify(state)) persist(remote, { push: false });
  } else if (state.channels.length > 0) {
    pushServerSetting('channels', state);
  }
});

export function getChannelsState(): ChannelState {
  return state;
}

export function getActiveChannel(): Channel | null {
  return state.channels.find((c) => c.id === state.activeId) ?? state.channels[0] ?? null;
}

/** Label for the composer chip (back-compat with the old single-name store). */
export function getChannelName(): string {
  return getActiveChannel()?.title ?? 'Add channel';
}

export function addChannel(ch: Channel): void {
  persist({
    channels: [...state.channels.filter((c) => c.id !== ch.id), ch],
    activeId: ch.id,
  });
}

export function setActiveChannel(id: string): void {
  persist({ ...state, activeId: id });
}

/** Update one channel's brand profile (merge patch) and/or niche. */
export function updateBrand(id: string, patch: Partial<BrandProfile>, niche?: string): void {
  persist({
    ...state,
    channels: state.channels.map((c) =>
      c.id === id
        ? { ...c, niche: niche ?? c.niche, brand: { ...brandOf(c), ...patch } }
        : c,
    ),
  });
}

export function removeChannel(id: string): void {
  const channels = state.channels.filter((c) => c.id !== id);
  persist({
    channels,
    activeId: state.activeId === id ? (channels[0]?.id ?? null) : state.activeId,
  });
}

export function subscribeChannel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The most recent 7:00 boundary — data fetched before it counts as stale. */
function lastSevenOClock(): number {
  const d = new Date();
  d.setHours(7, 0, 0, 0);
  if (Date.now() < d.getTime()) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/**
 * Refresh stats for channels not fetched since the last 7:00 — at most once a
 * day per channel, so the daily API quota is never wasted on reloads.
 */
export async function refreshChannelsIfStale(): Promise<void> {
  const boundary = lastSevenOClock();
  const stale = state.channels.filter((c) => c.fetchedAt < boundary);
  if (stale.length === 0) return;
  const updated = [...state.channels];
  for (const ch of stale) {
    try {
      const fresh = await fetchChannelById(ch.id);
      const i = updated.findIndex((c) => c.id === ch.id);
      updated[i] = { ...ch, ...fresh, fetchedAt: Date.now() };
    } catch {
      // quota/offline — keep cached data, retry after the next boundary
    }
  }
  persist({ ...state, channels: updated });
}
