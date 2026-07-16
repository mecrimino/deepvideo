/**
 * Stage 6 — history: persist pipeline state and picks.
 *
 * Records each run (inputs, stage results, decisions) so the editor can show
 * "why this clip", support re-runs of single stages, and stage4 can penalize
 * clips that were just used. Storage is injected (RunStore) so this package
 * stays free of file/db access; server/ provides a JSON-under-DATA_DIR store.
 * Without an injected store, runs live in process memory.
 */

import type { PipelineRun } from '@deep-video/shared';
import type { RunStore } from './types.js';

/** Fallback store used when the caller injects nothing (tests, dev). */
const memory = new Map<string, PipelineRun>();

const memoryStore: RunStore = {
  async save(run) {
    memory.set(run.id, structuredClone(run));
  },
  async load(id) {
    const run = memory.get(id);
    return run ? structuredClone(run) : null;
  },
  async list() {
    return [...memory.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, createdAt, status }) => ({ id, createdAt, status }));
  },
};

export async function saveRun(run: PipelineRun, store: RunStore = memoryStore): Promise<void> {
  await store.save(run);
}

export async function loadRun(runId: string, store: RunStore = memoryStore): Promise<PipelineRun> {
  const run = await store.load(runId);
  if (!run) throw new Error(`pipeline run not found: ${runId}`);
  return run;
}

export async function listRuns(
  store: RunStore = memoryStore,
): Promise<Pick<PipelineRun, 'id' | 'createdAt' | 'status'>[]> {
  return store.list();
}

/** Clip ids used in the most recent runs (variety penalty input for stage4). */
export async function recentlyUsedClipIds(
  limit = 3,
  store: RunStore = memoryStore,
): Promise<string[]> {
  const runs = await store.list();
  const ids: string[] = [];
  for (const meta of runs.slice(0, limit)) {
    const run = await store.load(meta.id);
    for (const pick of run?.picks ?? []) {
      if (pick.kind === 'retrieve') ids.push(pick.candidate.clipId);
    }
  }
  return [...new Set(ids)];
}
