/**
 * Deep Video v1 Mini — orchestrator.
 *
 * Runs the matching pipeline (spec steps 0-7) and reports progress through the
 * shared PipelineRun shape so the existing processing UI works unchanged:
 *
 *   segment  → step 0 (idea→script) + step 1 (clause segmentation)
 *   queries  → step 2 (niche, once) + step 3 (keyword per segment)
 *   retrieve → step 4 (Pexels+Pixabay pooling per segment)
 *   rerank   → step 5 (CLIP re-ranking per segment)
 *   pick     → step 6 (threshold + broaden fallback) + step 7 (repeat penalty
 *              + usage commits for non-review picks)
 *   history  → LEFT PENDING here: the server finishes it (downloads picked
 *              clips, assembles the Timeline, persists the run).
 */

import type { PickDecision, PipelineRun, PipelineStage, StageResult } from '@deep-video/shared';
import { uid } from '../text.js';
import { DEFAULT_MINI_SETTINGS, type MiniSettings } from './config.js';
import { acquireScript } from './step0_script.js';
import { segmentScript, segmentTranscriptWords } from './step1_transcribe.js';
import { detectNiche } from './step2_niche.js';
import { extractKeyword } from './step3_keyword.js';
import { retrieveCandidates } from './step4_retrieve.js';
import { rerankCandidates } from './step5_rerank.js';
import { pickClip } from './step6_pick.js';
import { applyRepeatPenalty } from './step7_history.js';
import type { MiniDeps, MiniInput, MiniMatchResult, SegmentPick, StockCandidate } from './types.js';

const STAGE_ORDER: PipelineStage[] = ['segment', 'queries', 'retrieve', 'rerank', 'pick', 'history'];

export async function runMiniMatching(deps: MiniDeps, input: MiniInput): Promise<MiniMatchResult> {
  const settings: MiniSettings = { ...DEFAULT_MINI_SETTINGS, ...input.settings };

  const run: PipelineRun = {
    id: uid('run'),
    createdAt: new Date().toISOString(),
    status: 'running',
    stage: 'segment',
    stages: STAGE_ORDER.map((stage): StageResult => ({ stage, status: 'pending' })),
    input: { script: input.script, audioPath: input.audioPath },
  };
  const stageOf = (s: PipelineStage) => run.stages.find((x) => x.stage === s)!;
  const emit = () => input.onProgress?.(structuredClone(run));
  const start = (s: PipelineStage) => {
    run.stage = s;
    const st = stageOf(s);
    st.status = 'running';
    st.startedAt = new Date().toISOString();
    emit();
  };
  const finish = (s: PipelineStage, output?: unknown) => {
    const st = stageOf(s);
    st.status = 'done';
    st.finishedAt = new Date().toISOString();
    if (output !== undefined) st.output = output;
    emit();
  };

  try {
    /* -------- segment: transcription/script + clause segmentation -------- */
    start('segment');
    const transcript =
      input.transcript ?? (input.getTranscript ? await input.getTranscript() : undefined);
    const script = transcript ? transcript.text : await acquireScript(input.script ?? '', deps.nicheLLM);
    const segments = transcript ? segmentTranscriptWords(transcript.words) : segmentScript(script);
    if (segments.length === 0) throw new Error('No segments produced from the input script');
    run.beats = segments.map((s) => ({
      id: s.id,
      text: s.text,
      range: { startSec: s.startSec, endSec: s.endSec },
    }));
    finish('segment', { segmentCount: segments.length });

    /* ------------- queries: niche (1x) + keyword per segment ------------ */
    start('queries');
    const niche = await detectNiche(script, deps.nicheLLM);
    const keywords = new Map<string, string>();
    for (const seg of segments) {
      const kw = await extractKeyword(niche, seg, deps.keywordLLM, deps.nicheLLM);
      keywords.set(seg.id, kw);
      run.beats!.find((b) => b.id === seg.id)!.queries = { said: seg.text, shown: kw, keywords: [kw] };
      emit();
    }
    finish('queries', { niche });

    /* --------------- retrieve: candidate pool per segment --------------- */
    start('retrieve');
    const pools = new Map<string, StockCandidate[]>();
    for (const seg of segments) {
      const pool = await retrieveCandidates([keywords.get(seg.id)!], deps.stock, settings.perSourceCount);
      pools.set(seg.id, pool.slice(0, settings.maxCandidatesPerSegment));
      emit();
    }
    finish('retrieve', { pooled: [...pools.values()].reduce((n, p) => n + p.length, 0) });

    /* ------------------- rerank: CLIP-score every pool ------------------ */
    start('rerank');
    const ranked = new Map<string, StockCandidate[]>();
    for (const seg of segments) {
      ranked.set(seg.id, await rerankCandidates(keywords.get(seg.id)!, pools.get(seg.id)!, deps.embedder));
      emit();
    }
    finish('rerank');

    /* ------ pick: threshold + fallback (step 6) + history (step 7) ------ */
    start('pick');
    const usedIds = await deps.usage.usedClipIds(input.projectId);
    const picks: SegmentPick[] = [];
    for (const seg of segments) {
      const kw = keywords.get(seg.id)!;
      const penalized = applyRepeatPenalty(ranked.get(seg.id)!, usedIds, settings.repeatPenalty);
      const pick = await pickClip(seg, kw, penalized, deps, usedIds, settings);
      picks.push(pick);
      if (pick.candidate && pick.status !== 'review') {
        await deps.usage.commitPick(input.projectId, pick.candidate.id, seg.startSec);
        usedIds.add(pick.candidate.id);
      }
      emit();
    }
    run.picks = picks.map((p): PickDecision => {
      if (p.candidate) {
        return {
          beatId: p.segment.id,
          kind: 'retrieve',
          candidate: {
            clipId: p.candidate.id,
            score: p.score,
            textScore: p.score,
            visualScore: p.score,
          },
        };
      }
      return {
        beatId: p.segment.id,
        kind: 'generate',
        slot: {
          id: uid('slot'),
          beatId: p.segment.id,
          prompt: p.keyword,
          durationSec: p.segment.endSec - p.segment.startSec,
          status: 'pending',
        },
      };
    });
    finish('pick', {
      auto: picks.filter((p) => p.status === 'auto').length,
      fallback: picks.filter((p) => p.status === 'auto-fallback').length,
      review: picks.filter((p) => p.status === 'review').length,
      unmatched: picks.filter((p) => p.status === 'none').length,
    });

    // 'history' (download + timeline assembly + persist) is completed by the
    // caller — run.status stays 'running' until then.
    run.stage = 'history';
    return { run, niche, script, segments, picks };
  } catch (err) {
    const st = stageOf(run.stage);
    if (st.status === 'running') {
      st.status = 'failed';
      st.error = err instanceof Error ? err.message : String(err);
    }
    run.status = 'failed';
    emit();
    throw err;
  }
}
