/**
 * Minimal .env loader (no dependency). Imported FIRST by index.ts so every
 * later module (paths.ts, mini/*) sees the variables. Loads the repo-root
 * .env, then server/.env if present; existing process.env values always win.
 *
 * Special case: a relative DATA_DIR in a .env file is resolved against that
 * file's directory (the repo root writes `DATA_DIR=./server/data`, which must
 * not be re-resolved against the server package's cwd).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  const dir = path.dirname(file);
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] !== undefined) continue;
    if (key === 'DATA_DIR' && value.startsWith('.')) {
      value = path.resolve(dir, value);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(here, '..', '..', '.env')); // repo root
loadEnvFile(path.resolve(here, '..', '.env')); // server package
