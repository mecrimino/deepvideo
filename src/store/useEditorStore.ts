/**
 * Editor state (Zustand) — the real timeline document plus playback,
 * selection, zoom, undo/redo and server sync. All edit operations mirror the
 * model package's pure timeline ops (optimistic local updates, same rules:
 * clips on a track never overlap, times are seconds, intervals half-open).
 */

import { create } from 'zustand';
import type {
  CaptionCue,
  ClipAsset,
  PipelineRun,
  Project,
  RenderJob,
  Timeline,
  TimelineClip,
} from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';
import { listClips } from '../services/clips';
import { getRenderJob, startRender } from '../services/render';
import { saveProject } from '../services/project';

const MIN_CLIP_SEC = 0.1;
const HISTORY_LIMIT = 60;

function uid(prefix = ''): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return prefix ? `${prefix}_${id}` : id;
}

/** URL for a DATA_DIR-relative media path served by the API. */
export function fileUrl(dataRelPath: string): string {
  return `/files/${dataRelPath.split('\\').join('/')}`;
}

export function emptyTimeline(): Timeline {
  return {
    id: uid('tl'),
    fps: 30,
    width: 1280,
    height: 720,
    durationSec: 0,
    tracks: [
      { id: uid('trk'), kind: 'video', name: 'Video', clips: [] },
      { id: uid('trk'), kind: 'audio', name: 'Narration', clips: [] },
    ],
    captions: [],
  };
}

function sortedVideoClips(t: Timeline): TimelineClip[] {
  return (t.tracks.find((tr) => tr.kind === 'video')?.clips ?? [])
    .slice()
    .sort((a, b) => a.range.startSec - b.range.startSec);
}

function recomputeDuration(t: Timeline): void {
  let end = 0;
  for (const track of t.tracks) for (const c of track.clips) end = Math.max(end, c.range.endSec);
  for (const cue of t.captions) end = Math.max(end, cue.range.endSec);
  t.durationSec = end;
}

interface EditorState {
  /** The open document. */
  projectId: string | null;
  projectTitle: string;
  timeline: Timeline | null;
  /** Library assets by id (thumbnails, durations, paths). */
  assets: Record<string, ClipAsset>;

  /* playback */
  playing: boolean;
  playheadSec: number;
  speed: number;
  muted: boolean;
  showCaptions: boolean;

  /* view */
  pxPerSec: number;
  selectedClipId: string | null;
  selectedCueId: string | null;
  activePanel: 'none' | 'media' | 'text';

  /* history */
  past: Timeline[];
  future: Timeline[];

  /* server sync */
  renderJob: RenderJob | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';

  /* ---- document lifecycle ---- */
  openTimeline: (t: Timeline, opts?: { title?: string; projectId?: string }) => void;
  openFromRun: (run: PipelineRun, title: string) => void;
  refreshAssets: () => Promise<void>;

  /* ---- playback ---- */
  setPlayhead: (sec: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (x: number) => void;
  toggleMuted: () => void;
  toggleCaptions: () => void;
  advance: (dt: number) => void;

  /* ---- view ---- */
  setPxPerSec: (v: number) => void;
  selectClip: (id: string | null) => void;
  selectCue: (id: string | null) => void;
  setActivePanel: (p: 'none' | 'media' | 'text') => void;

  /* ---- edits (all push history) ---- */
  moveClip: (clipId: string, newStartSec: number) => void;
  trimClipEdge: (clipId: string, edge: 'start' | 'end', newSec: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  addAssetAtPlayhead: (assetId: string) => void;
  addCaptionAtPlayhead: (text: string) => void;
  updateCaption: (cueId: string, text: string) => void;
  deleteCaption: (cueId: string) => void;
  applyTimeline: (t: Timeline) => void;
  undo: () => void;
  redo: () => void;

  /* ---- server ---- */
  saveNow: () => Promise<void>;
  requestRender: () => Promise<void>;
}

let saveTimer: number | undefined;

export const useEditorStore = create<EditorState>((set, get) => {
  /** Snapshot the current timeline into history, then mutate a clone. */
  function edit(mutate: (t: Timeline) => void): void {
    const { timeline, past } = get();
    if (!timeline) return;
    const next = structuredClone(timeline);
    try {
      mutate(next);
    } catch (err) {
      console.warn('edit rejected:', err);
      return;
    }
    recomputeDuration(next);
    set({
      timeline: next,
      past: [...past.slice(-HISTORY_LIMIT), timeline],
      future: [],
    });
    scheduleSave();
  }

  function scheduleSave(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void get().saveNow();
    }, 1500);
  }

  return {
    projectId: null,
    projectTitle: 'Untitled project',
    timeline: null,
    assets: {},

    playing: false,
    playheadSec: 0,
    speed: 1,
    muted: false,
    showCaptions: true,

    pxPerSec: 12,
    selectedClipId: null,
    selectedCueId: null,
    activePanel: 'none',

    past: [],
    future: [],

    renderJob: null,
    saveState: 'idle',

    /* ---------------------------- document ---------------------------- */

    openTimeline: (t, opts) => {
      set({
        timeline: structuredClone(t),
        projectId: opts?.projectId ?? uid('proj'),
        projectTitle: opts?.title ?? get().projectTitle,
        playheadSec: 0,
        playing: false,
        past: [],
        future: [],
        selectedClipId: null,
        selectedCueId: null,
        renderJob: null,
      });
      void get().refreshAssets();
    },

    openFromRun: (run, title) => {
      const t = run.timeline ?? emptyTimeline();
      get().openTimeline(t, { title });
      scheduleSave();
    },

    refreshAssets: async () => {
      try {
        const { assets } = await listClips();
        const byId: Record<string, ClipAsset> = {};
        for (const a of assets) byId[a.id] = a;
        set({ assets: byId });
      } catch (err) {
        console.warn('failed to load clip library', err);
      }
    },

    /* ---------------------------- playback ---------------------------- */

    setPlayhead: (sec) => {
      const dur = get().timeline?.durationSec ?? 0;
      set({ playheadSec: Math.max(0, Math.min(sec, dur)) });
    },
    play: () => {
      const { playheadSec, timeline } = get();
      if (timeline && playheadSec >= timeline.durationSec - 0.02) set({ playheadSec: 0 });
      set({ playing: true });
    },
    pause: () => set({ playing: false }),
    togglePlay: () => (get().playing ? get().pause() : get().play()),
    setSpeed: (x) => set({ speed: x }),
    toggleMuted: () => set((s) => ({ muted: !s.muted })),
    toggleCaptions: () => set((s) => ({ showCaptions: !s.showCaptions })),

    advance: (dt) => {
      const { playing, playheadSec, timeline } = get();
      if (!playing || !timeline) return;
      const next = playheadSec + dt;
      if (next >= timeline.durationSec) {
        set({ playheadSec: timeline.durationSec, playing: false });
      } else {
        set({ playheadSec: next });
      }
    },

    /* ------------------------------ view ------------------------------ */

    setPxPerSec: (v) => set({ pxPerSec: Math.max(2, Math.min(60, v)) }),
    selectClip: (id) => set({ selectedClipId: id, selectedCueId: null }),
    selectCue: (id) => set({ selectedCueId: id, selectedClipId: null }),
    setActivePanel: (p) => set({ activePanel: p }),

    /* ------------------------------ edits ----------------------------- */

    moveClip: (clipId, newStartSec) =>
      edit((t) => {
        for (const track of t.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) continue;
          const dur = clip.range.endSec - clip.range.startSec;
          const others = track.clips
            .filter((c) => c.id !== clipId)
            .sort((a, b) => a.range.startSec - b.range.startSec);

          let start = Math.max(0, newStartSec);
          // Clamp into the nearest gap that fits the clip.
          for (const o of others) {
            if (start < o.range.endSec && start + dur > o.range.startSec) {
              // Overlaps o — snap to whichever side is closer.
              const before = o.range.startSec - dur;
              const after = o.range.endSec;
              start = Math.abs(start - before) <= Math.abs(start - after) && before >= 0 ? before : after;
            }
          }
          // Final validation; bail (throw) if still overlapping.
          for (const o of others) {
            if (start < o.range.endSec && start + dur > o.range.startSec) {
              throw new Error('no room at that position');
            }
          }
          clip.range = { startSec: start, endSec: start + dur };
          track.clips.sort((a, b) => a.range.startSec - b.range.startSec);
          return;
        }
        throw new Error('clip not found');
      }),

    trimClipEdge: (clipId, edge, newSec) =>
      edit((t) => {
        for (const track of t.tracks) {
          const sorted = track.clips.slice().sort((a, b) => a.range.startSec - b.range.startSec);
          const idx = sorted.findIndex((c) => c.id === clipId);
          if (idx < 0) continue;
          const clip = sorted[idx];
          const prev = sorted[idx - 1];
          const next = sorted[idx + 1];
          const asset =
            clip.source.kind === 'asset' ? get().assets[clip.source.assetId] : undefined;

          if (edge === 'start') {
            let lo = prev ? prev.range.endSec : 0;
            if (clip.source.kind === 'asset') {
              // Can't reveal media before the source's first frame.
              lo = Math.max(lo, clip.range.startSec - clip.source.inSec);
            }
            const hi = clip.range.endSec - MIN_CLIP_SEC;
            const v = Math.max(lo, Math.min(newSec, hi));
            if (clip.source.kind === 'asset') {
              clip.source.inSec += v - clip.range.startSec;
            }
            clip.range.startSec = v;
          } else {
            let hi = next ? next.range.startSec : Number.POSITIVE_INFINITY;
            if (clip.source.kind === 'asset' && asset && asset.durationSec > 0) {
              hi = Math.min(hi, clip.range.endSec + (asset.durationSec - clip.source.outSec));
            }
            const lo = clip.range.startSec + MIN_CLIP_SEC;
            const v = Math.max(lo, Math.min(newSec, hi));
            if (clip.source.kind === 'asset') {
              clip.source.outSec += v - clip.range.endSec;
            }
            clip.range.endSec = v;
          }
          return;
        }
        throw new Error('clip not found');
      }),

    splitAtPlayhead: () => {
      const { timeline, playheadSec, selectedClipId } = get();
      if (!timeline) return;
      const clips = sortedVideoClips(timeline);
      const target =
        clips.find((c) => c.id === selectedClipId && c.range.startSec < playheadSec && playheadSec < c.range.endSec) ??
        clips.find((c) => c.range.startSec < playheadSec && playheadSec < c.range.endSec);
      if (!target) return;
      if (
        playheadSec - target.range.startSec < MIN_CLIP_SEC ||
        target.range.endSec - playheadSec < MIN_CLIP_SEC
      ) {
        return;
      }
      edit((t) => {
        const track = t.tracks.find((tr) => tr.clips.some((c) => c.id === target.id));
        const clip = track?.clips.find((c) => c.id === target.id);
        if (!track || !clip) throw new Error('clip not found');
        const second: TimelineClip = structuredClone(clip);
        second.id = uid('clip');
        second.range = { startSec: playheadSec, endSec: clip.range.endSec };
        if (second.source.kind === 'asset' && clip.source.kind === 'asset') {
          second.source.inSec = clip.source.inSec + (playheadSec - clip.range.startSec);
        }
        if (clip.source.kind === 'asset') {
          clip.source.outSec -= clip.range.endSec - playheadSec;
        }
        clip.range = { ...clip.range, endSec: playheadSec };
        track.clips.push(second);
        track.clips.sort((a, b) => a.range.startSec - b.range.startSec);
      });
    },

    deleteSelected: () => {
      const { selectedClipId, selectedCueId } = get();
      if (selectedClipId) {
        edit((t) => {
          for (const track of t.tracks) {
            track.clips = track.clips.filter((c) => c.id !== selectedClipId);
          }
        });
        set({ selectedClipId: null });
      } else if (selectedCueId) {
        edit((t) => {
          t.captions = t.captions.filter((c) => c.id !== selectedCueId);
        });
        set({ selectedCueId: null });
      }
    },

    addAssetAtPlayhead: (assetId) => {
      const { assets, playheadSec } = get();
      const asset = assets[assetId];
      if (!asset) return;
      const dur = asset.durationSec > 0 ? Math.min(asset.durationSec, 5) : 4;
      edit((t) => {
        const track = t.tracks.find((tr) => tr.kind === 'video');
        if (!track) throw new Error('no video track');
        // Find a start at/after the playhead that fits.
        let start = Math.max(0, playheadSec);
        const sorted = track.clips.slice().sort((a, b) => a.range.startSec - b.range.startSec);
        for (const o of sorted) {
          if (start < o.range.endSec && start + dur > o.range.startSec) start = o.range.endSec;
        }
        track.clips.push({
          id: uid('clip'),
          source: { kind: 'asset', assetId, inSec: 0, outSec: dur },
          range: { startSec: start, endSec: start + dur },
          label: asset.tags.slice(0, 6).join(' ') || asset.path,
        });
        track.clips.sort((a, b) => a.range.startSec - b.range.startSec);
      });
    },

    addCaptionAtPlayhead: (text) => {
      const { playheadSec } = get();
      edit((t) => {
        const cue: CaptionCue = {
          id: uid('cue'),
          text,
          range: { startSec: playheadSec, endSec: playheadSec + 3 },
        };
        t.captions = [...t.captions, cue].sort((a, b) => a.range.startSec - b.range.startSec);
      });
    },

    updateCaption: (cueId, text) =>
      edit((t) => {
        const cue = t.captions.find((c) => c.id === cueId);
        if (!cue) throw new Error('caption not found');
        cue.text = text;
      }),

    deleteCaption: (cueId) => {
      edit((t) => {
        t.captions = t.captions.filter((c) => c.id !== cueId);
      });
      if (get().selectedCueId === cueId) set({ selectedCueId: null });
    },

    applyTimeline: (t) => {
      const { timeline, past } = get();
      if (!timeline) return;
      set({
        timeline: structuredClone(t),
        past: [...past.slice(-HISTORY_LIMIT), timeline],
        future: [],
      });
      scheduleSave();
    },

    undo: () => {
      const { past, future, timeline } = get();
      if (past.length === 0 || !timeline) return;
      set({
        timeline: past[past.length - 1],
        past: past.slice(0, -1),
        future: [timeline, ...future].slice(0, HISTORY_LIMIT),
      });
      scheduleSave();
    },

    redo: () => {
      const { past, future, timeline } = get();
      if (future.length === 0 || !timeline) return;
      set({
        timeline: future[0],
        future: future.slice(1),
        past: [...past.slice(-HISTORY_LIMIT), timeline],
      });
      scheduleSave();
    },

    /* ----------------------------- server ----------------------------- */

    saveNow: async () => {
      const { projectId, projectTitle, timeline } = get();
      if (!projectId || !timeline) return;
      set({ saveState: 'saving' });
      try {
        const now = new Date().toISOString();
        const project: Project = {
          id: projectId,
          title: projectTitle,
          createdAt: now,
          updatedAt: now,
          timeline,
        };
        await saveProject({ project });
        set({ saveState: 'saved' });
      } catch (err) {
        console.warn('save failed', err);
        set({ saveState: 'error' });
      }
    },

    requestRender: async () => {
      const { timeline, renderJob } = get();
      if (!timeline || renderJob?.status === 'running') return;
      try {
        const { job } = await startRender({ timeline });
        set({ renderJob: job });
        const poll = async (): Promise<void> => {
          const current = get().renderJob;
          if (!current) return;
          try {
            const { job: fresh } = await getRenderJob(current.id);
            set({ renderJob: fresh });
            if (fresh.status === 'running' || fresh.status === 'queued') {
              window.setTimeout(() => void poll(), 800);
            }
          } catch {
            window.setTimeout(() => void poll(), 2000);
          }
        };
        window.setTimeout(() => void poll(), 800);
      } catch (err) {
        set({
          renderJob: {
            id: 'local',
            status: 'failed',
            progress: 0,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
  };
});

/** The video-track clip under a given time, if any. */
export function clipAtTime(t: Timeline | null, sec: number): TimelineClip | null {
  if (!t) return null;
  return (
    sortedVideoClips(t).find((c) => c.range.startSec <= sec && sec < c.range.endSec) ?? null
  );
}

/** The caption cue visible at a given time, if any. */
export function cueAtTime(t: Timeline | null, sec: number): CaptionCue | null {
  if (!t) return null;
  return t.captions.find((c) => c.range.startSec <= sec && sec < c.range.endSec) ?? null;
}

export { sortedVideoClips };
