/**
 * Backend gateway configuration (Ch3 / Ch20).
 *
 * The Node gateway owns local concerns (uploads, projects, render, static
 * serving) and proxies AI work to the Python core. All runtime paths resolve to
 * the repo-root data directories the README documents.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');

export const config = {
  root: ROOT,
  port: Number(process.env.BACKEND_PORT) || 8787,
  host: process.env.BACKEND_HOST || '127.0.0.1',
  /** Base URL of the Python core (FastAPI). */
  coreUrl: process.env.CORE_URL || 'http://127.0.0.1:8000',
  paths: {
    cache: resolve(ROOT, 'cache'),
    downloads: resolve(ROOT, 'downloads'),
    temp: resolve(ROOT, 'temp'),
    uploads: resolve(ROOT, 'temp', 'upload'),
    renders: resolve(ROOT, 'temp', 'render'),
    projects: resolve(ROOT, 'projects'),
    assets: resolve(ROOT, 'assets'),
    logs: resolve(ROOT, 'logs'),
  },
} as const;

export type AppConfig = typeof config;
