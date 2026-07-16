/**
 * Stage 5 — the retrieve-or-generate decision.
 *
 * For each beat: if the best reranked candidate clears settings.matchThreshold,
 * pick it (with in/out points sized to the beat). Otherwise leave a
 * GenerationSlot — v1 renders a placeholder; a future generator fills it
 * (see generate.ts). A slot is ALWAYS better than a misleading clip.
 */

import type { Beat, MatchCandidate, PickDecision, PipelineSettings } from '@deep-video/shared';
import { uid } from './text.js';

export async function pickClips(input: {
  beats: Beat[];
  reranked: Map<string, MatchCandidate[]>;
  settings: PipelineSettings;
}): Promise<PickDecision[]> {
  const { beats, reranked, settings } = input;
  const picks: PickDecision[] = [];
  let prevClipId: string | undefined;

  for (const beat of beats) {
    const list = reranked.get(beat.id) ?? [];
    let best = list[0];

    // Avoid back-to-back repeats when a nearly-as-good alternative exists.
    if (best && best.clipId === prevClipId) {
      const alt = list.find(
        (c) => c.clipId !== prevClipId && c.score >= best!.score - 0.08,
      );
      if (alt && alt.score >= settings.matchThreshold) best = alt;
    }

    if (best && best.score >= settings.matchThreshold) {
      const beatDur = beat.range.endSec - beat.range.startSec;
      const inSec = best.inSec ?? 0;
      const outSec = best.outSec ?? inSec + beatDur;
      picks.push({
        beatId: beat.id,
        kind: 'retrieve',
        candidate: { ...best, inSec, outSec },
      });
      prevClipId = best.clipId;
    } else {
      picks.push({
        beatId: beat.id,
        kind: 'generate',
        slot: {
          id: uid('slot'),
          beatId: beat.id,
          prompt: beat.queries?.shown ?? beat.text,
          durationSec: beat.range.endSec - beat.range.startSec,
          status: 'pending',
        },
      });
      prevClipId = undefined;
    }
  }
  return picks;
}
