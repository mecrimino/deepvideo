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
  ShotSpec,
  Timeline,
  TimelineClip,
  Track,
} from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';
import { listClips } from '../services/clips';
import { getRenderJob, startRender } from '../services/render';
import { saveProject } from '../services/project';
import { fillRun, getRun } from '../services/pipelineRun';

const MIN_CLIP_SEC = 0.1;
const HISTORY_LIMIT = 60;
/** Extra lanes the user may stack on top of the base video / first audio lane. */
const MAX_OVERLAY_LANES = 5;
const MAX_AUDIO_LANES = 5;
const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i;
/** How long a still image lasts when it lands on the timeline. */
const IMAGE_SEC = 4;

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
      { id: uid('trk'), kind: 'audio', name: 'Audio 1', clips: [] },
    ],
    captions: [],
  };
}

function sortedVideoClips(t: Timeline): TimelineClip[] {
  return (t.tracks.find((tr) => tr.kind === 'video')?.clips ?? [])
    .slice()
    .sort((a, b) => a.range.startSec - b.range.startSec);
}

/**
 * The visual layer lanes, top-most first: overlay tracks stack ABOVE the base
 * video track. Array order in timeline.tracks defines stacking priority.
 */
export function laneTracks(t: Timeline): Track[] {
  return t.tracks.filter((tr) => tr.kind === 'overlay' || tr.kind === 'video');
}

/** The audio lanes (narration bed, sfx, music), in display order. */
export function audioLanes(t: Timeline): Track[] {
  return t.tracks.filter((tr) => tr.kind === 'audio');
}

/** Every lane a clip can be dragged between — visual lanes and audio lanes never mix. */
function siblingLanes(t: Timeline, clipId: string): Track[] {
  const home = t.tracks.find((tr) => tr.clips.some((c) => c.id === clipId));
  return home?.kind === 'audio' ? audioLanes(t) : laneTracks(t);
}

/**
 * The lane a clip lives on. Throws when the lane is locked, which is how every
 * edit refuses to touch it — `edit()` turns the message into a notice.
 */
function editableTrackOf(t: Timeline, clipId: string): Track {
  const track = t.tracks.find((tr) => tr.clips.some((c) => c.id === clipId));
  if (!track) throw new Error('clip not found');
  if (track.locked) throw new Error(`${track.name} is locked`);
  return track;
}

/** Slide `start` right until the clip fits between the lane's existing clips. */
function fitStart(track: Track, startSec: number, dur: number, skipId?: string): number {
  let start = Math.max(0, startSec);
  const others = track.clips
    .filter((c) => c.id !== skipId)
    .slice()
    .sort((a, b) => a.range.startSec - b.range.startSec);
  for (const o of others) {
    if (start < o.range.endSec && start + dur > o.range.startSec) start = o.range.endSec;
  }
  return start;
}

/** How long an asset should run when first dropped on the timeline. */
function naturalDuration(asset: ClipAsset): number {
  return asset.durationSec > 0 ? asset.durationSec : IMAGE_SEC;
}

export function isAudioAsset(asset: ClipAsset | undefined): boolean {
  return Boolean(asset && AUDIO_RE.test(asset.path));
}

function recomputeDuration(t: Timeline): void {
  let end = 0;
  for (const track of t.tracks) for (const c of track.clips) end = Math.max(end, c.range.endSec);
  for (const cue of t.captions) end = Math.max(end, cue.range.endSec);
  t.durationSec = end;
}

/** A clip the user attached to the agent chat ("Add to Deep Video Agent"). */
export interface ChatMention {
  clipId: string;
  /** 1-based index on the video track (what the agent calls "clip N"). */
  index: number;
  label: string;
  /** Thumbnail URL when the clip's asset has one. */
  thumb?: string;
}

interface EditorState {
  /** The open document. */
  projectId: string | null;
  projectTitle: string;
  timeline: Timeline | null;
  /** The pipeline run this document came from (enables fill-missing-footage). */
  runId: string | null;
  /** A fill-missing-footage pass is running server-side. */
  filling: boolean;
  /** Library assets by id (thumbnails, durations, paths). */
  assets: Record<string, ClipAsset>;

  /** Clips attached to the agent composer as mention chips. */
  chatMentions: ChatMention[];
  /** Clip whose stock-replacement picker is open (null = closed). */
  replaceTargetClipId: string | null;

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
  activePanel: 'none' | 'media' | 'text' | 'presets' | 'sfx';
  /** Height (px) of the transport+timeline strip — drag the preview pill. */
  timelineH: number;
  /** Width (px) of the agent panel — drag its left-edge handle. */
  agentW: number;

  /* history */
  past: Timeline[];
  future: Timeline[];

  /** Transient status line above the timeline (drop results, drop errors). */
  notice: { text: string; error?: boolean } | null;
  setNotice: (text: string | null, error?: boolean) => void;

  /* server sync */
  renderJob: RenderJob | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  /** Render-options dialog (resolution + captions) visibility. */
  renderDialogOpen: boolean;

  /* ---- document lifecycle ---- */
  openTimeline: (t: Timeline, opts?: { title?: string; projectId?: string; runId?: string }) => void;
  openFromRun: (run: PipelineRun, title: string) => void;
  /** Fill beats that got no footage (e.g. clips stop at 6 min of a 10-min video). */
  fillMissingFootage: () => Promise<void>;
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
  setActivePanel: (p: 'none' | 'media' | 'text' | 'presets' | 'sfx') => void;
  setTimelineH: (px: number) => void;
  setAgentW: (px: number) => void;

  /* ---- agent chat mentions ---- */
  addMentionFromSelection: () => void;
  removeMention: (clipId: string) => void;
  clearMentions: () => void;

  /* ---- stock replace picker ---- */
  openReplace: (clipId: string) => void;
  closeReplace: () => void;
  /** Point a clip at a (usually just-imported) library asset, keeping length. */
  replaceClipWithAsset: (clipId: string, asset: ClipAsset, inSec?: number) => void;

  /* ---- edits (all push history) ---- */
  moveClip: (clipId: string, newStartSec: number) => void;
  /** Move a clip N lanes up (negative) / down (positive) at newStartSec. */
  moveClipLane: (clipId: string, laneDelta: number, newStartSec: number) => void;
  /** Add a visual overlay layer above the top lane, or another audio lane. */
  addLayer: (kind?: 'overlay' | 'audio') => void;
  /** Mute / unmute a whole lane (audio lanes; also skipped at render). */
  toggleTrackMuted: (trackId: string) => void;
  /** Lock / unlock a lane: locked lanes refuse every edit and every drop. */
  toggleTrackLocked: (trackId: string) => void;
  /** Delete a lane and everything on it (undoable). */
  removeTrack: (trackId: string) => void;
  /** Delete one clip by id — what the × on a selected clip calls. */
  deleteClip: (clipId: string) => void;
  trimClipEdge: (clipId: string, edge: 'start' | 'end', newSec: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  addAssetAtPlayhead: (assetId: string) => void;
  /**
   * Drop an asset on a specific lane at a specific time (the drag-and-drop
   * entry point). Audio always lands on an audio lane and footage on a visual
   * one, whichever lane it was dropped over.
   */
  addAssetAt: (assetId: string, trackId: string | null, startSec: number) => void;
  /** Take an asset into the local catalog (after an upload or a registration). */
  registerAsset: (asset: ClipAsset) => void;
  /** Apply (or clear, with a null filter) a look preset on one clip. */
  setClipLook: (clipId: string, lookId: string | null, filter: string | null) => void;
  /** Put a freshly composed shot in the library and on the timeline. */
  addComposedAsset: (asset: ClipAsset, spec?: ShotSpec, at?: { trackId: string | null; startSec: number }) => void;
  /** Re-render of an existing shot clip: swap its media, keep its place. */
  updateClipShot: (clipId: string, asset: ClipAsset, spec: ShotSpec) => void;
  addCaptionAtPlayhead: (text: string) => void;
  updateCaption: (cueId: string, text: string) => void;
  deleteCaption: (cueId: string) => void;
  applyTimeline: (t: Timeline) => void;
  undo: () => void;
  redo: () => void;

  /* ---- server ---- */
  saveNow: () => Promise<void>;
  setRenderDialogOpen: (open: boolean) => void;
  requestRender: (opts?: { width?: number; height?: number; burnCaptions?: boolean }) => Promise<void>;
}

let saveTimer: number | undefined;
let noticeTimer: number | undefined;

export const useEditorStore = create<EditorState>((set, get) => {
  /** Snapshot the current timeline into history, then mutate a clone. */
  function edit(mutate: (t: Timeline) => void): void {
    const { timeline, past } = get();
    if (!timeline) return;
    const next = structuredClone(timeline);
    try {
      mutate(next);
    } catch (err) {
      // Rejections are rules, not bugs ("lane is locked", "no room here") —
      // say so instead of failing silently.
      console.warn('edit rejected:', err);
      get().setNotice((err as Error).message, true);
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
    runId: null,
    filling: false,
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
    chatMentions: [],
    replaceTargetClipId: null,
    timelineH: Math.min(280, Number(localStorage.getItem('deepvideo.ui.timelineH')) || 192),
    agentW: Number(localStorage.getItem('deepvideo.ui.agentW')) || 268,

    past: [],
    future: [],

    notice: null,
    renderJob: null,
    saveState: 'idle',
    renderDialogOpen: false,

    /* ---------------------------- document ---------------------------- */

    openTimeline: (t, opts) => {
      set({
        timeline: structuredClone(t),
        projectId: opts?.projectId ?? uid('proj'),
        runId: opts?.runId ?? get().runId,
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
      get().openTimeline(t, { title, runId: run.id });
      scheduleSave();
    },

    fillMissingFootage: async () => {
      const { runId } = get();
      if (!runId || get().filling) return;
      set({ filling: true });
      try {
        await fillRun(runId);
        // poll until the fill pass finishes, then swap in the new timeline
        for (;;) {
          await new Promise((r) => window.setTimeout(r, 3000));
          const run = await getRun(runId);
          if (run.status !== 'running') {
            if (run.timeline) {
              get().openTimeline(run.timeline, {
                title: get().projectTitle,
                projectId: get().projectId ?? undefined,
                runId,
              });
              scheduleSave();
            }
            break;
          }
        }
      } catch (err) {
        console.warn('fill missing footage failed', err);
      } finally {
        set({ filling: false });
      }
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

    setTimelineH: (px) => {
      // Cap so clip filmstrips never upscale past their thumbnail resolution.
      const v = Math.round(Math.max(120, Math.min(280, px)));
      localStorage.setItem('deepvideo.ui.timelineH', String(v));
      set({ timelineH: v });
    },

    setAgentW: (px) => {
      const v = Math.round(Math.max(232, Math.min(520, px)));
      localStorage.setItem('deepvideo.ui.agentW', String(v));
      set({ agentW: v });
    },
    setNotice: (text, error) => {
      window.clearTimeout(noticeTimer);
      if (!text) return set({ notice: null });
      set({ notice: { text, error } });
      noticeTimer = window.setTimeout(() => set({ notice: null }), error ? 6000 : 2600);
    },

    selectClip: (id) => set({ selectedClipId: id, selectedCueId: null }),
    selectCue: (id) => set({ selectedCueId: id, selectedClipId: null }),
    setActivePanel: (p) => set({ activePanel: p }),

    /* ------------------------- agent mentions -------------------------- */

    addMentionFromSelection: () => {
      const { timeline, selectedClipId, assets, chatMentions } = get();
      if (!timeline || !selectedClipId) return;
      const clips = sortedVideoClips(timeline);
      const index = clips.findIndex((c) => c.id === selectedClipId);
      if (index < 0) return;
      const clip = clips[index];
      if (chatMentions.some((m) => m.clipId === clip.id)) return; // already attached
      const asset = clip.source.kind === 'asset' ? assets[clip.source.assetId] : undefined;
      set({
        chatMentions: [
          ...chatMentions,
          {
            clipId: clip.id,
            index: index + 1,
            label: clip.label?.trim() || `Clip ${index + 1}`,
            thumb: asset?.thumbPath ? fileUrl(asset.thumbPath) : undefined,
          },
        ],
      });
    },

    removeMention: (clipId) =>
      set((s) => ({ chatMentions: s.chatMentions.filter((m) => m.clipId !== clipId) })),

    clearMentions: () => set({ chatMentions: [] }),

    /* ----------------------- stock replace picker ---------------------- */

    openReplace: (clipId) => set({ replaceTargetClipId: clipId }),
    closeReplace: () => set({ replaceTargetClipId: null }),

    replaceClipWithAsset: (clipId, asset, inSec = 0) => {
      // Register the asset so thumbnails/preview resolve immediately.
      set((s) => ({ assets: { ...s.assets, [asset.id]: asset } }));
      edit((t) => {
        let found: TimelineClip | undefined;
        for (const track of t.tracks) {
          const c = track.clips.find((cl) => cl.id === clipId);
          if (c) {
            found = c;
            break;
          }
        }
        if (!found) throw new Error('clip not found');
        const dur = found.range.endSec - found.range.startSec;
        const maxIn = asset.durationSec > dur ? asset.durationSec - dur : 0;
        const safeIn = Math.max(0, Math.min(inSec, maxIn));
        found.source = { kind: 'asset', assetId: asset.id, inSec: safeIn, outSec: safeIn + dur };
        found.label = asset.tags.slice(0, 6).join(' ') || asset.path;
        delete (found as { review?: boolean }).review;
      });
    },

    /* ------------------------------ edits ----------------------------- */

    moveClip: (clipId, newStartSec) =>
      edit((t) => {
        const track = editableTrackOf(t, clipId);
        const clip = track.clips.find((c) => c.id === clipId)!;
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
      }),

    moveClipLane: (clipId, laneDelta, newStartSec) =>
      edit((t) => {
        // A sound effect can only move between audio lanes, footage between
        // visual ones — the lane list depends on where the clip lives now.
        const from = editableTrackOf(t, clipId);
        const lanes = siblingLanes(t, clipId);
        const toIdx = lanes.indexOf(from) + laneDelta;
        if (toIdx < 0 || toIdx >= lanes.length) throw new Error('no lane there');
        const to = lanes[toIdx];
        if (to.locked) throw new Error(`${to.name} is locked`);
        const clip = from.clips.find((c) => c.id === clipId)!;
        const dur = clip.range.endSec - clip.range.startSec;

        const start = fitStart(to, newStartSec, dur);
        from.clips = from.clips.filter((c) => c.id !== clipId);
        clip.range = { startSec: start, endSec: start + dur };
        to.clips.push(clip);
        to.clips.sort((a, b) => a.range.startSec - b.range.startSec);
      }),

    addLayer: (kind = 'overlay') =>
      edit((t) => {
        if (kind === 'audio') {
          const count = audioLanes(t).length;
          if (count >= MAX_AUDIO_LANES) throw new Error(`maximum ${MAX_AUDIO_LANES} audio lanes`);
          t.tracks.push({ id: uid('trk'), kind: 'audio', name: `Audio ${count + 1}`, clips: [] });
          return;
        }
        const overlayCount = t.tracks.filter((tr) => tr.kind === 'overlay').length;
        if (overlayCount >= MAX_OVERLAY_LANES) throw new Error(`maximum ${MAX_OVERLAY_LANES + 1} layers`);
        // Insert at the front: earlier tracks stack ABOVE later ones.
        t.tracks.unshift({
          id: uid('trk'),
          kind: 'overlay',
          name: `Layer ${overlayCount + 2}`,
          clips: [],
        });
      }),

    toggleTrackMuted: (trackId) =>
      edit((t) => {
        const track = t.tracks.find((tr) => tr.id === trackId);
        if (!track) throw new Error('track not found');
        track.muted = !track.muted;
      }),

    toggleTrackLocked: (trackId) =>
      edit((t) => {
        const track = t.tracks.find((tr) => tr.id === trackId);
        if (!track) throw new Error('track not found');
        track.locked = !track.locked;
      }),

    removeTrack: (trackId) => {
      edit((t) => {
        const track = t.tracks.find((tr) => tr.id === trackId);
        if (!track) throw new Error('track not found');
        if (track.locked) throw new Error(`${track.name} is locked`);
        // The base video lane is the document's floor — it can be emptied but
        // not removed, or there is nowhere left to drop footage.
        if (track.kind === 'video' && t.tracks.filter((tr) => tr.kind === 'video').length === 1) {
          throw new Error('the base video lane cannot be removed');
        }
        t.tracks = t.tracks.filter((tr) => tr.id !== trackId);
      });
      const gone = get().selectedClipId;
      if (gone && !get().timeline?.tracks.some((tr) => tr.clips.some((c) => c.id === gone))) {
        set({ selectedClipId: null });
      }
    },

    trimClipEdge: (clipId, edge, newSec) =>
      edit((t) => {
        const track = editableTrackOf(t, clipId);
        const sorted = track.clips.slice().sort((a, b) => a.range.startSec - b.range.startSec);
        const idx = sorted.findIndex((c) => c.id === clipId);
        const clip = sorted[idx];
        const prev = sorted[idx - 1];
        const next = sorted[idx + 1];
        const asset = clip.source.kind === 'asset' ? get().assets[clip.source.assetId] : undefined;

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
      }),

    splitAtPlayhead: () => {
      const { timeline, playheadSec, selectedClipId } = get();
      if (!timeline) return;
      const clips = laneTracks(timeline).flatMap((l) => l.clips);
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
        const track = editableTrackOf(t, target.id);
        const clip = track.clips.find((c) => c.id === target.id)!;
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

    deleteClip: (clipId) => {
      edit((t) => {
        const track = editableTrackOf(t, clipId);
        track.clips = track.clips.filter((c) => c.id !== clipId);
      });
      // Only drop the selection if the clip really went — a locked lane
      // refuses the edit, and the clip must stay selected and visible.
      const gone = !get().timeline?.tracks.some((tr) => tr.clips.some((c) => c.id === clipId));
      if (gone && get().selectedClipId === clipId) set({ selectedClipId: null });
    },

    deleteSelected: () => {
      const { selectedClipId, selectedCueId } = get();
      if (selectedClipId) {
        get().deleteClip(selectedClipId);
      } else if (selectedCueId) {
        edit((t) => {
          t.captions = t.captions.filter((c) => c.id !== selectedCueId);
        });
        set({ selectedCueId: null });
      }
    },

    addAssetAtPlayhead: (assetId) => get().addAssetAt(assetId, null, get().playheadSec),

    registerAsset: (asset) => set({ assets: { ...get().assets, [asset.id]: asset } }),

    addAssetAt: (assetId, trackId, startSec) => {
      const asset = get().assets[assetId];
      if (!asset) return;
      const dur = naturalDuration(asset);
      const wantAudio = isAudioAsset(asset);
      edit((t) => {
        const dropped = trackId ? t.tracks.find((tr) => tr.id === trackId) : undefined;
        if (dropped?.locked) throw new Error(`${dropped.name} is locked`);
        // Sound dropped on a picture lane (or the reverse) still goes where it
        // belongs — on the first unlocked lane of the right kind.
        let track =
          dropped && (dropped.kind === 'audio') === wantAudio
            ? dropped
            : wantAudio
              ? audioLanes(t).find((tr) => !tr.locked)
              : t.tracks.find((tr) => tr.kind === 'video' && !tr.locked);
        if (!track && wantAudio) {
          // Every audio lane was removed or locked — sound still has to land
          // somewhere, so open a fresh lane for it.
          const count = audioLanes(t).length;
          if (count >= MAX_AUDIO_LANES) throw new Error('every audio lane is locked');
          track = { id: uid('trk'), kind: 'audio', name: `Audio ${count + 1}`, clips: [] };
          t.tracks.push(track);
        }
        if (!track) throw new Error('the video lane is locked');
        const start = fitStart(track, startSec, dur);
        track.clips.push({
          id: uid('clip'),
          source: { kind: 'asset', assetId, inSec: 0, outSec: dur },
          range: { startSec: start, endSec: start + dur },
          label: asset.tags.slice(0, 6).join(' ') || asset.path.split('/').pop() || asset.path,
        });
        track.clips.sort((a, b) => a.range.startSec - b.range.startSec);
      });
    },

    setClipLook: (clipId, lookId, filter) =>
      edit((t) => {
        const clip = editableTrackOf(t, clipId).clips.find((c) => c.id === clipId)!;
        if (filter && lookId) {
          clip.lookId = lookId;
          clip.look = filter;
        } else {
          delete clip.lookId;
          delete clip.look;
        }
      }),

    addComposedAsset: (asset, spec, at) => {
      // The shot is a real file the gateway already registered — take it into
      // the local catalog so the timeline can reference it by id.
      set({ assets: { ...get().assets, [asset.id]: asset } });
      const startSec = at ? at.startSec : get().playheadSec;
      const dur = naturalDuration(asset);
      edit((t) => {
        // A graphic belongs over the footage: the lane it was dropped on, else
        // the first overlay lane free at that moment, else a new layer.
        const dropped = at?.trackId ? t.tracks.find((tr) => tr.id === at.trackId) : undefined;
        if (dropped?.locked) throw new Error(`${dropped.name} is locked`);
        let track = dropped?.kind !== 'audio' ? dropped : undefined;
        track ??= t.tracks.find(
          (tr) =>
            tr.kind === 'overlay' &&
            !tr.locked &&
            !tr.clips.some((c) => startSec < c.range.endSec && startSec + dur > c.range.startSec),
        );
        if (!track) {
          const overlays = t.tracks.filter((tr) => tr.kind === 'overlay').length;
          if (overlays >= MAX_OVERLAY_LANES) throw new Error(`maximum ${MAX_OVERLAY_LANES + 1} layers`);
          track = { id: uid('trk'), kind: 'overlay', name: `Layer ${overlays + 2}`, clips: [] };
          t.tracks.unshift(track);
        }
        const start = fitStart(track, startSec, dur);
        track.clips.push({
          id: uid('clip'),
          source: { kind: 'asset', assetId: asset.id, inSec: 0, outSec: dur },
          range: { startSec: start, endSec: start + dur },
          label: asset.tags.slice(0, 3).join(' ') || 'shot',
          shotSpec: spec,
        });
        track.clips.sort((a, b) => a.range.startSec - b.range.startSec);
      });
    },

    updateClipShot: (clipId, asset, spec) => {
      set({ assets: { ...get().assets, [asset.id]: asset } });
      edit((t) => {
        const track = editableTrackOf(t, clipId);
        const clip = track.clips.find((c) => c.id === clipId)!;
        // Re-rendering may change the shot's length — grow into the gap after
        // it when there is room, otherwise keep the slot the clip already has.
        const next = track.clips
          .filter((c) => c.id !== clipId && c.range.startSec >= clip.range.startSec)
          .sort((a, b) => a.range.startSec - b.range.startSec)[0];
        const room = (next?.range.startSec ?? Infinity) - clip.range.startSec;
        const dur = Math.max(MIN_CLIP_SEC, Math.min(naturalDuration(asset), room));
        clip.source = { kind: 'asset', assetId: asset.id, inSec: 0, outSec: dur };
        clip.range = { startSec: clip.range.startSec, endSec: clip.range.startSec + dur };
        clip.shotSpec = spec;
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
      const { projectId, projectTitle, timeline, runId } = get();
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
          runId: runId ?? undefined,
        };
        await saveProject({ project });
        set({ saveState: 'saved' });
      } catch (err) {
        console.warn('save failed', err);
        set({ saveState: 'error' });
      }
    },

    setRenderDialogOpen: (open) => set({ renderDialogOpen: open }),

    requestRender: async (opts) => {
      const { timeline, renderJob } = get();
      if (!timeline || renderJob?.status === 'running') return;
      set({ renderDialogOpen: false });
      try {
        const { job } = await startRender({ timeline, ...opts });
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

/** Tiny gaps between clips are trim artifacts (ms), not intended black beats. */
const GAP_BRIDGE_SEC = 0.1;

/** The visible clip under a given time: top-most layer wins. */
export function clipAtTime(t: Timeline | null, sec: number): TimelineClip | null {
  if (!t) return null;
  for (const lane of laneTracks(t)) {
    const hit = lane.clips.find((c) => c.range.startSec <= sec && sec < c.range.endSec);
    if (hit) return hit;
  }
  // No clip is exactly under the playhead — if that's only a micro-gap between
  // two clips, show the clip on the near side instead of flashing black. Prefer
  // an imminent clip (its first frame) over one that just ended (a seeked-past
  // -end frame). Real gaps (> GAP_BRIDGE_SEC) still read as intended black.
  let best: TimelineClip | null = null;
  let bestScore = Infinity;
  for (const lane of laneTracks(t)) {
    for (const c of lane.clips) {
      const ahead = c.range.startSec - sec; // >0 when the clip is upcoming
      const behind = sec - c.range.endSec; // >0 when the clip just ended
      if (ahead > 0 && ahead <= GAP_BRIDGE_SEC && ahead < bestScore) {
        best = c;
        bestScore = ahead;
      } else if (behind >= 0 && behind <= GAP_BRIDGE_SEC && behind + GAP_BRIDGE_SEC < bestScore) {
        // Bias toward upcoming clips: an ended clip only wins if nothing ahead.
        best = c;
        bestScore = behind + GAP_BRIDGE_SEC;
      }
    }
  }
  return best;
}

/** Audio-lane clips sounding at a given time (muted lanes excluded). */
export function audioClipsAtTime(t: Timeline | null, sec: number): TimelineClip[] {
  if (!t) return [];
  return audioLanes(t)
    .filter((lane) => !lane.muted)
    .flatMap((lane) => lane.clips.filter((c) => c.range.startSec <= sec && sec < c.range.endSec));
}

/** The clip on one specific lane at a given time — what a drop landed on. */
export function clipOnTrackAt(t: Timeline | null, trackId: string, sec: number): TimelineClip | null {
  const track = t?.tracks.find((tr) => tr.id === trackId);
  return track?.clips.find((c) => c.range.startSec <= sec && sec < c.range.endSec) ?? null;
}

/** The caption cue visible at a given time, if any. */
export function cueAtTime(t: Timeline | null, sec: number): CaptionCue | null {
  if (!t) return null;
  return t.captions.find((c) => c.range.startSec <= sec && sec < c.range.endSec) ?? null;
}

export { sortedVideoClips };
