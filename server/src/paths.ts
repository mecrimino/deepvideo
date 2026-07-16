/**
 * DATA_DIR layout + helpers. All server storage lives under server/data/
 * (gitignored): media uploads, thumbnails, the clip catalog, pipeline runs,
 * saved projects and rendered exports.
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to server/data (override with DATA_DIR). */
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(here, '..', 'data'));

export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
export const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
export const RUNS_DIR = path.join(DATA_DIR, 'runs');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, MEDIA_DIR, THUMBS_DIR, EXPORTS_DIR, PROJECTS_DIR, RUNS_DIR, TMP_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

/** DATA_DIR-relative form stored in ClipAsset.path (posix separators). */
export function toDataRelative(absPath: string): string {
  return path.relative(DATA_DIR, absPath).split(path.sep).join('/');
}

/** Resolve a DATA_DIR-relative (or already absolute) media path. */
export function fromDataRelative(relOrAbs: string): string {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(DATA_DIR, relOrAbs);
}
