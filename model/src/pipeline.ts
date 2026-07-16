/**
 * Pipeline orchestrator: runs stage1 -> stage6 and assembles the timeline.
 *
 * Dependencies (LLM, embedder, clip index, generator) are injected so this
 * package never imports server code or native libraries. server/src/index.ts
 * wires the real implementations in.
 */

import type {
  PipelineRun,
  PipelineSettings,
  PipelineStage,
  StageResult,
  Transcript,
} from '@deep-video/shared';
import { buildCaptions, captionsFromBeats } from './captions.js';
import { DEFAULT_SETTINGS } from './config.js';
import type { VideoGenerator } from './generate.js';
import type { LLMClient } from './llm.js';
import { segmentIntoBeats } from './stage1_segment.js';
import { buildQueries } from './stage2_queries.js';
import { retrieveCandidates } from './stage3_retrieve.js';
import { rerankCandidates } from './stage4_rerank.js';
import { pickClips } from './stage5_pick.js';
import { recentlyUsedClipIds, saveRun } from './stage6_history.js';
import { uid } from './text.js';
import { assembleFromPicks, createTimeline } from './timeline.js';
import type { ClipIndex, Embedder, RunStore } from './types.js';

export interface PipelineDeps {
  llm: LLMClient;
  embedder: Embedder;
  index: ClipIndex;
  /** Optional; v1 uses DeferredGenerator (never called, slots stay pending). */
  generator?: VideoGenerator;
  /** Optional persistence for runs (stage6); in-memory when omitted. */
  runStore?: RunStore;
}

export interface PipelineInput {
  /** Provide a script OR narration audio's transcript (not both). */
  script?: string;
  transcript?: Transcript;
  settings?: Partial<PipelineSettings>;
  /** Streamed progress callback for the frontend. */
  onProgress?: (run: PipelineRun) => void;
}

const STAGES: PipelineStage[] = ['segment', 'queries', 'retrieve', 'rerank', 'pick', 'history'];

/**
 * Run the full pipeline:
 *   1. segmentIntoBeats   (stage1_segment)
 *   2. buildQueries       (stage2_queries)
 *   3. retrieveCandidates (stage3_retrieve)
 *   4. rerankCandidates   (stage4_rerank)
 *   5. pickClips          (stage5_pick)
 *   6. saveRun            (stage6_history)
 * then timeline.assembleFromPicks -> PipelineRun.timeline.
 */
export async function runPipeline(deps: PipelineDeps, input: PipelineInput): Promise<PipelineRun> {
  const settings: PipelineSettings = { ...DEFAULT_SETTINGS, ...input.settings };

  const run: PipelineRun = {
    id: uid('run'),
    createdAt: new Date().toISOString(),
    status: 'running',
    stage: 'segment',
    stages: STAGES.map((stage) => ({ stage, status: 'pending' }) as StageResult),
    input: { script: input.script, audioPath: undefined },
    transcript: input.transcript,
  };

  const report = () => {
    input.onProgress?.(structuredClone(run));
  };

  const stageOf = (stage: PipelineStage) => {
    const s = run.stages.find((r) => r.stage === stage);
    if (!s) throw new Error(`unknown stage ${stage}`);
    return s;
  };

  const start = (stage: PipelineStage) => {
    run.stage = stage;
    const s = stageOf(stage);
    s.status = 'running';
    s.startedAt = new Date().toISOString();
    report();
  };

  const finish = (stage: PipelineStage, output?: unknown) => {
    const s = stageOf(stage);
    s.status = 'done';
    s.finishedAt = new Date().toISOString();
    s.output = output;
    report();
  };

  try {
    start('segment');
    const beats = await segmentIntoBeats({
      script: input.script,
      transcript: input.transcript,
      llm: deps.llm,
      settings,
    });
    run.beats = beats;
    finish('segment', { beatCount: beats.length });

    start('queries');
    const queries = await buildQueries({ beats, llm: deps.llm });
    for (const beat of beats) beat.queries = queries.get(beat.id);
    finish('queries', { queryCount: queries.size });

    start('retrieve');
    const candidates = await retrieveCandidates({
      beats,
      embedder: deps.embedder,
      index: deps.index,
      settings,
    });
    finish('retrieve', {
      candidateCount: [...candidates.values()].reduce((n, list) => n + list.length, 0),
    });

    start('rerank');
    let recentlyUsed: string[] = [];
    try {
      recentlyUsed = await recentlyUsedClipIds(3, deps.runStore);
    } catch {
      // Variety penalty is optional; a fresh store simply has no history.
    }
    const reranked = await rerankCandidates({
      beats,
      candidates,
      settings,
      index: deps.index,
      recentlyUsed,
    });
    finish('rerank', {});

    start('pick');
    const picks = await pickClips({ beats, reranked, settings });
    run.picks = picks;
    finish('pick', {
      retrieved: picks.filter((p) => p.kind === 'retrieve').length,
      slots: picks.filter((p) => p.kind === 'generate').length,
    });

    // Assemble the EDL the editor will open.
    const durationSec =
      input.transcript?.durationSec ?? (beats.length > 0 ? beats[beats.length - 1].range.endSec : 0);
    let timeline = createTimeline({ durationSec });
    timeline = assembleFromPicks(timeline, beats, picks);
    timeline.captions = input.transcript
      ? buildCaptions(input.transcript)
      : captionsFromBeats(beats);
    run.timeline = timeline;

    start('history');
    run.status = 'done';
    await saveRun(run, deps.runStore);
    finish('history', { runId: run.id });

    return run;
  } catch (err) {
    run.status = 'failed';
    const s = stageOf(run.stage);
    s.status = 'failed';
    s.error = err instanceof Error ? err.message : String(err);
    try {
      await saveRun(run, deps.runStore);
    } catch {
      // Best effort — the caller still gets the failed run back.
    }
    report();
    return run;
  }
}
