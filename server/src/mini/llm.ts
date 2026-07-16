/**
 * MiniLLM implementations for Deep Video v1 Mini.
 *
 * Both providers speak the OpenAI-compatible /chat/completions protocol:
 *  - Groq       — model openai/gpt-oss-120b (niche detection, script writing)
 *  - OpenRouter — model tencent/hy3:free    (per-segment keyword extraction)
 *
 * Keys come comma-separated from .env (GROQ_API_KEYS / OPENROUTER_API_KEYS —
 * see api.md for the per-key rate limits). On 429/quota/5xx the client
 * rotates to the next key and retries; the rotation index persists across
 * calls so a rate-limited key isn't hammered again immediately.
 */

import type { mini } from '@deep-video/model';

type MiniLLM = mini.MiniLLM;

function keysFromEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

class RotatingChatLLM implements MiniLLM {
  readonly name: string;
  private readonly url: string;
  private readonly model: string;
  private readonly keys: string[];
  private idx = 0;

  constructor(name: string, url: string, model: string, keys: string[]) {
    this.name = name;
    this.url = url;
    this.model = model;
    this.keys = keys;
  }

  async complete(prompt: string, opts?: { temperature?: number; timeoutMs?: number }): Promise<string> {
    if (this.keys.length === 0) throw new Error(`${this.name}: no API keys configured`);
    const attempts = Math.min(this.keys.length, 6);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const key = this.keys[this.idx % this.keys.length];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 30_000);
      try {
        const res = await fetch(this.url, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            temperature: opts?.temperature ?? 0,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status >= 500) {
          this.idx++; // rotate away from this key
          lastErr = new Error(`${this.name}: HTTP ${res.status}`);
          continue;
        }
        if (!res.ok) {
          throw new Error(`${this.name}: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new Error(`${this.name}: empty completion`);
        }
        return content;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastErr = new Error(`${this.name}: timed out`);
        } else {
          lastErr = err;
        }
        this.idx++;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`${this.name}: all keys failed`);
  }
}

/** Groq — openai/gpt-oss-120b. Used for niche detection + script writing. */
export function createGroqMiniLLM(): MiniLLM {
  return new RotatingChatLLM(
    'groq',
    'https://api.groq.com/openai/v1/chat/completions',
    process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    keysFromEnv('GROQ_API_KEYS'),
  );
}

/** OpenRouter — tencent/hy3:free. Used for per-segment keyword extraction. */
export function createOpenRouterMiniLLM(): MiniLLM {
  return new RotatingChatLLM(
    'openrouter',
    'https://openrouter.ai/api/v1/chat/completions',
    process.env.OPENROUTER_MODEL ?? 'tencent/hy3:free',
    keysFromEnv('OPENROUTER_API_KEYS'),
  );
}
