/** Typed fetch wrapper for the local API (proxied /api -> localhost:8787). */

import type { ApiError } from '@deep-video/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly notImplemented: boolean;

  constructor(status: number, body: ApiError) {
    super(body.error ?? `Request failed with ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.notImplemented = body.notImplemented ?? false;
  }
}

export async function fetchJson<TResponse, TBody = unknown>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: TBody },
): Promise<TResponse> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json()) as TResponse | ApiError;
  if (!res.ok) {
    throw new ApiRequestError(res.status, json as ApiError);
  }
  return json as TResponse;
}
