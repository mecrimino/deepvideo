/**
 * Local email/password auth client — replaces Auth0. The session token lives
 * in localStorage and is validated against GET /api/auth/me on startup.
 * Components subscribe via useSyncExternalStore (same pattern as credits.ts).
 */

import type { AuthResponse, AuthUser, LoginRequest, MeResponse, SignupRequest } from '@deep-video/shared';

const TOKEN_KEY = 'deepvideo.auth.token';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

let state: AuthState = { status: 'loading', user: null };
const listeners = new Set<() => void>();

function setState(next: AuthState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

const SERVER_DOWN_MSG =
  'Cannot reach the local Deep Video server. Restart the app (npm run dev now starts it automatically) or run `npm run server`, then try again.';

/** Parse a response that SHOULD be JSON; a dead proxy answers with an empty
 *  or HTML body, which must become a human message, not a JSON parse crash. */
async function parseJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(SERVER_DOWN_MSG);
  }
  const json = await parseJson<T & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(json?.error ?? (res.status >= 500 ? SERVER_DOWN_MSG : `Request failed (${res.status})`));
  }
  if (!json) throw new Error(SERVER_DOWN_MSG);
  return json;
}

/** Validate any stored token on startup; call once from main.tsx. */
export async function restoreSession(): Promise<void> {
  const token = getToken();
  if (!token) {
    setState({ status: 'signedOut', user: null });
    return;
  }
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    const parsed = await parseJson<MeResponse>(res);
    const user = parsed?.user ?? null;
    setState(user ? { status: 'signedIn', user } : { status: 'signedOut', user: null });
    // Only discard the token when the server ANSWERED that it's invalid; an
    // unreachable server (parsed === null) keeps it for the next launch.
    if (parsed && !user) localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Server unreachable: stay signed out but keep the token for next launch.
    setState({ status: 'signedOut', user: null });
  }
}

export async function signup(req: SignupRequest): Promise<void> {
  const { user, token } = await post<AuthResponse>('/api/auth/signup', req);
  localStorage.setItem(TOKEN_KEY, token);
  setState({ status: 'signedIn', user });
}

export async function login(req: LoginRequest): Promise<void> {
  const { user, token } = await post<AuthResponse>('/api/auth/login', req);
  localStorage.setItem(TOKEN_KEY, token);
  setState({ status: 'signedIn', user });
}

export async function logout(): Promise<void> {
  try {
    await post('/api/auth/logout');
  } catch {
    // Signing out locally always succeeds.
  }
  localStorage.removeItem(TOKEN_KEY);
  setState({ status: 'signedOut', user: null });
}
