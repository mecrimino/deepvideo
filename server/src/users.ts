/**
 * Local email/password accounts — no cloud identity provider. Users and
 * sessions persist as JSON under DATA_DIR (users.json). Passwords are stored
 * as scrypt hashes (per-user random salt, timing-safe compare); sessions are
 * opaque random bearer tokens with a 30-day sliding expiry.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AuthUser } from '@deep-video/shared';
import { DATA_DIR } from './paths.js';

const FILE = path.join(DATA_DIR, 'users.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  salt: string;
  hash: string;
}

interface StoredSession {
  token: string;
  userId: string;
  expiresAt: number;
}

interface UserDb {
  users: StoredUser[];
  sessions: StoredSession[];
}

let db: UserDb | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<UserDb> {
  if (db) return db;
  try {
    db = JSON.parse(await fs.readFile(FILE, 'utf8')) as UserDb;
    db.users ??= [];
    db.sessions ??= [];
  } catch {
    db = { users: [], sessions: [] };
  }
  return db;
}

function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db), 'utf8');
    await fs.rename(tmp, FILE);
  });
  return writeChain;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function toPublic(u: StoredUser): AuthUser {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

function newToken(): string {
  return randomBytes(32).toString('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createSession(userId: string): Promise<string> {
  const data = await load();
  // Prune expired sessions while we're here.
  const now = Date.now();
  data.sessions = data.sessions.filter((s) => s.expiresAt > now);
  const token = newToken();
  data.sessions.push({ token, userId, expiresAt: now + SESSION_TTL_MS });
  await persist();
  return token;
}

export async function signup(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ user: AuthUser; token: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
  if ((input.password ?? '').length < 6) throw new Error('Password must be at least 6 characters.');

  const data = await load();
  if (data.users.some((u) => u.email === email)) {
    throw new Error('An account with this email already exists — sign in instead.');
  }
  const salt = randomBytes(16).toString('hex');
  const user: StoredUser = {
    id: `user_${randomBytes(8).toString('hex')}`,
    email,
    name: input.name?.trim() || undefined,
    createdAt: new Date().toISOString(),
    salt,
    hash: hashPassword(input.password, salt),
  };
  data.users.push(user);
  await persist();
  return { user: toPublic(user), token: await createSession(user.id) };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: AuthUser; token: string }> {
  const email = normalizeEmail(input.email);
  const data = await load();
  const user = data.users.find((u) => u.email === email);
  // Same error for unknown email and wrong password (no account probing).
  const fail = () => new Error('Wrong email or password.');
  if (!user) throw fail();
  const candidate = Buffer.from(hashPassword(input.password ?? '', user.salt), 'hex');
  const stored = Buffer.from(user.hash, 'hex');
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) throw fail();
  return { user: toPublic(user), token: await createSession(user.id) };
}

/** Resolve a bearer token to its user; extends the session's expiry. */
export async function me(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const data = await load();
  const session = data.sessions.find((s) => s.token === token);
  if (!session || session.expiresAt <= Date.now()) return null;
  const user = data.users.find((u) => u.id === session.userId);
  if (!user) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS; // sliding expiry
  void persist();
  return toPublic(user);
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  const data = await load();
  data.sessions = data.sessions.filter((s) => s.token !== token);
  await persist();
}
