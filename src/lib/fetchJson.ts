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

const SERVER_DOWN: ApiError = {
  error:
    'Cannot reach the local Deep Video server. Restart the app (npm run dev now starts it automatically) or run `npm run server`.',
};

export async function fetchJson<TResponse, TBody = unknown>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: TBody },
): Promise<TResponse> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body ? 'POST' : 'GET'),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, SERVER_DOWN);
  }
  // A dead proxy answers 5xx with an empty/HTML body — parse defensively so
  // callers see a human message instead of "Unexpected end of JSON input".
  const text = await res.text();
  let json: TResponse | ApiError | null = null;
  try {
    json = text ? (JSON.parse(text) as TResponse | ApiError) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new ApiRequestError(res.status, (json as ApiError) ?? SERVER_DOWN);
  }
  if (json === null) throw new ApiRequestError(res.status, SERVER_DOWN);
  return json as TResponse;
}
