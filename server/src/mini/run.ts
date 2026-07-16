/**
 * Deep Video v1 Mini — server orchestration.
 *
 * Runs the model package's matching pipeline (spec steps 0-7) with the real
 * backends (Groq/OpenRouter, Pexels/Pixabay, CLIP, usage log), then finishes
 * the run's 'history' stage: download every picked stock clip into the local
 * library (probe + thumbnail + catalog), assemble the Timeline aligned to the
 * segment timings, and persist the run. Review picks are placed with
 * `review: true` so the editor outlines them yellow; segments with no
 * candidate at all become GenerationSlots.
 */

import type {
  CaptionCue,
  ClipAsset,
  PipelineRun,
  Timeline,
  TimelineClip,
  Track,
} from '@deep-video/shared';
import { captionsFromBeats, mini, uid } from '@deep-video/model';
import type { ClipEmbedder } from '../clip.js';
import type { ClipDb } from '../db.js';
import { registerMediaFile, saveUpload } from '../library.js';
import type { RunStore } from '@deep-video/model';

const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 3;

export interface MiniServerDeps {
  /** Local clip catalog + its (library) embedder — for registering downloads. */
  db: ClipDb;
  libraryEmbedder: ClipEmbedder;
  runStore: RunStore;
  /** The mini pipeline's injected seams. */
  nicheLLM: mini.MiniLLM;
  keywordLLM: mini.MiniLLM;
  stock: mini.StockSearch;
  vision: mini.TextImageEmbedder;
  usage: mini.UsageStore;
}

export interface MiniRunInput {
  script?: string;
  /** DATA_DIR-relative narration audio path (from POST /api/audio/upload). */
  audioPath?: string;
  /** Lazy whisper transcription for `audioPath` (runs during 'segment'). */
  getTranscript?: () => Promise<import('@deep-video/shared').Transcript>;
  settings?: Partial<mini.MiniSettings>;
  onProgress?: (run: PipelineRun) => void;
}

async function downloadCandidate(
  cand: mini.StockCandidate,
  keyword: string,
  deps: MiniServerDeps,
): Promise<ClipAsset> {
  const res = await fetch(cand.videoUrl);
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${cand.id}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_DOWNLOAD_BYTES) throw new Error(`clip ${cand.id} too large (${len} bytes)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`clip ${cand.id} too large`);
  const dest = await saveUpload(`${cand.id}.mp4`, buf);
  return registerMediaFile(dest, deps.db, deps.libraryEmbedder, {
    source: 'stock',
    tags: [...keyword.split(/\s+/), cand.source],
    license: cand.source === 'pexels' ? 'Pexels' : 'Pixabay',
  });
}

/** Download all unique picked candidates with limited concurrency. */
async function downloadPicked(
  picks: mini.SegmentPick[],
  deps: MiniServerDeps,
  onOne?: () => void,
): Promise<Map<string, ClipAsset>> {
  const unique = new Map<string, { cand: mini.StockCandidate; keyword: string }>();
  for (const p of picks) {
    if (p.candidate && !unique.has(p.candidate.id)) {
      unique.set(p.candidate.id, { cand: p.candidate, keyword: p.keyword });
    }
  }
  const entries = [...unique.values()];
  const assets = new Map<string, ClipAsset>();
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const { cand, keyword } = entries[next++];
      try {
        assets.set(cand.id, await downloadCandidate(cand, keyword, deps));
      } catch {
        // download failed -> the segment falls back to a GenerationSlot
      }
      onOne?.();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, entries.length || 1) }, worker),
  );
  return assets;
}

function slotClip(pick: mini.SegmentPick, range: { startSec: number; endSec: number }): TimelineClip {
  return {
    id: uid('clip'),
    beatId: pick.segment.id,
    source: {
      kind: 'generate',
      slot: {
        id: uid('slot'),
        beatId: pick.segment.id,
        prompt: pick.keyword,
        durationSec: range.endSec - range.startSec,
        status: 'pending',
      },
    },
    range,
    label: pick.keyword,
  };
}

function assembleTimeline(
  picks: mini.SegmentPick[],
  assets: Map<string, ClipAsset>,
  captions: CaptionCue[],
  narration?: { audioPath: string; durationSec: number },
): Timeline {
  // Contiguous coverage: each clip runs from the previous boundary to the
  // next segment's start (pauses in the narration stay on screen instead of
  // flashing filler); the last clip covers any trailing audio.
  const lastEnd = picks.length
    ? Math.max(
        picks[picks.length - 1].segment.endSec,
        narration?.durationSec ?? 0,
      )
    : (narration?.durationSec ?? 0);
  const clips: TimelineClip[] = picks.map((pick, i) => {
    const range = {
      startSec: i === 0 ? 0 : picks[i].segment.startSec,
      endSec: i + 1 < picks.length ? picks[i + 1].segment.startSec : lastEnd,
    };
    const asset = pick.candidate ? assets.get(pick.candidate.id) : undefined;
    if (!asset) return slotClip(pick, range);
    const segDur = range.endSec - range.startSec;
    const usable = asset.durationSec > 0 ? Math.min(asset.durationSec, segDur) : segDur;
    return {
      id: uid('clip'),
      beatId: pick.segment.id,
      source: { kind: 'asset', assetId: asset.id, inSec: 0, outSec: usable },
      range,
      label: pick.keyword,
      review: pick.status === 'review' ? true : undefined,
      matchScore: Math.round(pick.score * 1000) / 1000,
    };
  });

  const durationSec = lastEnd;
  const tracks: Track[] = [
    { id: uid('trk'), kind: 'video', name: 'Video', clips },
    { id: uid('trk'), kind: 'audio', name: 'Narration', clips: [] },
  ];
  return {
    id: uid('tl'),
    fps: 30,
    width: 1280,
    height: 720,
    durationSec,
    audioPath: narration?.audioPath,
    tracks,
    captions,
  };
}

/**
 * Full mini run: match (stages segment..pick stream progress from the model
 * package), then complete the 'history' stage here — downloads + timeline
 * assembly + persistence. Always resolves with a terminal run (done/failed).
 */
export async function runMiniPipeline(deps: MiniServerDeps, input: MiniRunInput): Promise<PipelineRun> {
  const projectId = uid('proj');
  let narrationTranscript: import('@deep-video/shared').Transcript | undefined;
  const result = await mini.runMiniMatching(
    {
      nicheLLM: deps.nicheLLM,
      keywordLLM: deps.keywordLLM,
      stock: deps.stock,
      embedder: deps.vision,
      usage: deps.usage,
    },
    {
      projectId,
      script: input.script,
      audioPath: input.audioPath,
      getTranscript: input.getTranscript
        ? async () => (narrationTranscript = await input.getTranscript!())
        : undefined,
      settings: input.settings,
      onProgress: input.onProgress,
    },
  );

  const { run, picks } = result;
  const historyStage = run.stages.find((s) => s.stage === 'history')!;
  const emit = () => input.onProgress?.(structuredClone(run));

  try {
    historyStage.status = 'running';
    historyStage.startedAt = new Date().toISOString();
    emit();

    const assets = await downloadPicked(picks, deps, emit);
    const captions = captionsFromBeats(run.beats ?? []);
    run.timeline = assembleTimeline(
      picks,
      assets,
      captions,
      input.audioPath
        ? { audioPath: input.audioPath, durationSec: narrationTranscript?.durationSec ?? 0 }
        : undefined,
    );

    historyStage.status = 'done';
    historyStage.finishedAt = new Date().toISOString();
    historyStage.output = {
      downloaded: assets.size,
      review: picks.filter((p) => p.status === 'review').length,
    };
    run.status = 'done';
  } catch (err) {
    historyStage.status = 'failed';
    historyStage.error = err instanceof Error ? err.message : String(err);
    run.status = 'failed';
  }

  await deps.runStore.save(run).catch(() => undefined);
  emit();
  return run;
}
