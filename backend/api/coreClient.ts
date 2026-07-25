/**
 * Thin client for the Python core (FastAPI). Every AI/agentic call the gateway
 * receives is forwarded here. If the core is down we surface a clear, typed
 * error so the frontend degrades gracefully rather than hanging (Ch20).
 */

import { config } from '../config/index.ts';

export class CoreDownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreDownError';
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${config.coreUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new CoreDownError(
      `Python core unreachable at ${config.coreUrl} (${(err as Error).message}). ` +
        `Start it with: npm run dev:core`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`core ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export const core = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body),
  async health(): Promise<{ ok: boolean } & Record<string, unknown>> {
    try {
      return await call('GET', '/health');
    } catch {
      return { ok: false };
    }
  },
};
