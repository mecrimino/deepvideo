/**
 * Tiny JSON-file persistence (Ch20.17 "SQLite, upgrade later" — here even
 * simpler: JSON catalogs on the local SSD). Used for the clip library index and
 * the saved-projects list. Atomic-ish writes via a temp file + rename.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, path);
}
