/**
 * Stage 6 — history: persist pipeline state and picks.
 *
 * Records each run (inputs, stage results, decisions) so the editor can show
 * "why this clip", support re-runs of single stages, and stage4 can penalize
 * clips that were just used. Persisted as JSON under DATA_DIR (no DB server).
 */

import type { PipelineRun } from '@deep-video/shared';
import { NotImplementedError } from './types.js';

export async function saveRun(_run: PipelineRun): Promise<void> {
  throw new NotImplementedError('model/stage6_history.saveRun');
}

export async function loadRun(_runId: string): Promise<PipelineRun> {
  throw new NotImplementedError('model/stage6_history.loadRun');
}

export async function listRuns(): Promise<Pick<PipelineRun, 'id' | 'createdAt' | 'status'>[]> {
  throw new NotImplementedError('model/stage6_history.listRuns');
}

/** Clip ids used in the most recent runs (variety penalty input for stage4). */
export async function recentlyUsedClipIds(_limit?: number): Promise<string[]> {
  throw new NotImplementedError('model/stage6_history.recentlyUsedClipIds');
}
