/**
 * RunStore implementation for the model package's stage6: pipeline runs
 * persisted as JSON files under DATA_DIR/runs/<id>.json.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PipelineRun } from '@deep-video/shared';
import type { RunStore } from '@deep-video/model';
import { RUNS_DIR } from './paths.js';

export function createRunStore(): RunStore {
  return {
    async save(run: PipelineRun): Promise<void> {
      await fs.mkdir(RUNS_DIR, { recursive: true });
      const file = path.join(RUNS_DIR, `${sanitize(run.id)}.json`);
      await fs.writeFile(file, JSON.stringify(run, null, 2), 'utf8');
    },

    async load(id: string): Promise<PipelineRun | null> {
      try {
        const raw = await fs.readFile(path.join(RUNS_DIR, `${sanitize(id)}.json`), 'utf8');
        return JSON.parse(raw) as PipelineRun;
      } catch {
        return null;
      }
    },

    async list(): Promise<Pick<PipelineRun, 'id' | 'createdAt' | 'status'>[]> {
      let files: string[];
      try {
        files = await fs.readdir(RUNS_DIR);
      } catch {
        return [];
      }
      const runs: Pick<PipelineRun, 'id' | 'createdAt' | 'status'>[] = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(RUNS_DIR, f), 'utf8');
          const { id, createdAt, status } = JSON.parse(raw) as PipelineRun;
          runs.push({ id, createdAt, status });
        } catch {
          // Ignore unreadable run files.
        }
      }
      return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

function sanitize(id: string): string {
  return id.replace(/[^\w-]/g, '_');
}
