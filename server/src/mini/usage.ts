/**
 * Step 7 backend — the used-clips log (anti-repetition).
 * JSON-file equivalent of the spec's used_clips SQLite table:
 * { [projectId]: [{ clipId, sceneTs }] } at DATA_DIR/used-clips.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { mini } from '@deep-video/model';
import { DATA_DIR } from '../paths.js';

type UsageStore = mini.UsageStore;

const USAGE_FILE = path.join(DATA_DIR, 'used-clips.json');

interface UsageData {
  [projectId: string]: { clipId: string; sceneTs: number }[];
}

export function createUsageStore(): UsageStore {
  let cache: UsageData | null = null;
  let writing: Promise<void> = Promise.resolve();

  async function load(): Promise<UsageData> {
    if (cache) return cache;
    try {
      cache = JSON.parse(await fs.readFile(USAGE_FILE, 'utf8')) as UsageData;
    } catch {
      cache = {};
    }
    return cache;
  }

  return {
    async usedClipIds(projectId: string): Promise<Set<string>> {
      const data = await load();
      return new Set((data[projectId] ?? []).map((r) => r.clipId));
    },

    async commitPick(projectId: string, clipId: string, sceneTs: number): Promise<void> {
      const data = await load();
      (data[projectId] ??= []).push({ clipId, sceneTs });
      writing = writing.then(() =>
        fs.writeFile(USAGE_FILE, JSON.stringify(data), 'utf8').catch(() => undefined),
      );
      await writing;
    },
  };
}
