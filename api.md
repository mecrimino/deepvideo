# External APIs — reference

> **Read this before wiring any external model or media source.** All keys live
> in **`.env`** (gitignored — never commit keys or paste them into code).
> Multiple keys per provider are stored comma-separated so callers can rotate
> keys when one hits its rate limit.
>
> Note: these free-tier cloud APIs are an *upgrade path* over the pure-local v1
> seams — they slot into the existing interfaces (`LLMClient` in
> `model/src/llm.ts`, stock search in stage3, `VideoGenerator`/image gen in
> `model/src/generate.ts`). Keep every caller behind those seams.

---

## 1. LLM — OpenRouter

| | |
|---|---|
| Use for | Agent pipeline stages (segment, queries, agent chat) |
| Model | **`tencent/hy3:free`** |
| Endpoint | `POST https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible) |
| Auth | `Authorization: Bearer <key>` |
| Rate limit | **20 requests/min, 50 requests/day — PER KEY** |
| Keys | `.env` → `OPENROUTER_API_KEYS` (16 keys, comma-separated) |
| Model env | `.env` → `OPENROUTER_MODEL` |

With 16 keys rotated: effectively ~320 req/min, ~800 req/day. Rotate to the
next key on HTTP 429.

```ts
const keys = process.env.OPENROUTER_API_KEYS!.split(',');
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${keys[i % keys.length]}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: process.env.OPENROUTER_MODEL, // tencent/hy3:free
    messages: [{ role: 'user', content: 'How many r\'s are in "strawberry"?' }],
    reasoning: { enabled: true },
  }),
});
```

## 2. LLM — Groq

| | |
|---|---|
| Use for | Fast agent-pipeline calls (bigger model, generous tokens) |
| Model | **`openai/gpt-oss-120b`** ("gpt 120b") |
| Endpoint | `POST https://api.groq.com/openai/v1/chat/completions` (OpenAI-compatible) |
| Auth | `Authorization: Bearer <key>` |
| Rate limit | **PER KEY: 30 req/min · 1,000 req/day · 8k tokens/min · 200k tokens/day** |
| Keys | `.env` → `GROQ_API_KEYS` (10 keys, comma-separated) |
| Model env | `.env` → `GROQ_MODEL` |

Same OpenAI chat shape as OpenRouter — both fit `LLMClient` unchanged.
Prefer Groq for latency/token-heavy stages; fall back to OpenRouter on 429.

## 3. Stock video/photos — Pexels

| | |
|---|---|
| Use for | Stage-3 stock footage retrieval (free, license-safe) |
| Endpoints | `GET https://api.pexels.com/videos/search?query=...&per_page=...` · `GET https://api.pexels.com/v1/search?query=...` (photos) |
| Auth | `Authorization: <key>` header (no "Bearer") |
| Keys | `.env` → `PEXELS_API_KEYS` (7 keys, comma-separated) |
| Limits | ~200 req/hr, 20k/month per key — rotate on 429 |

## 4. Stock video/photos — Pixabay

| | |
|---|---|
| Use for | Second stock source (variety + fallback for Pexels) |
| Endpoints | `GET https://pixabay.com/api/videos/?key=<key>&q=...` · `GET https://pixabay.com/api/?key=<key>&q=...` (photos) |
| Auth | `key` **query parameter** (not a header) |
| Keys | `.env` → `PIXABAY_API_KEYS` (8 keys, comma-separated) |
| Limits | ~100 req/min per key — rotate on 429 |

## 5. AI image generation

Two options, both keyless-or-trivial — use for beat imagery when no stock
matches (fills `GenerationSlot`s with stills until real video gen exists):

**a) Cloudflare Worker (own deployment)**

| | |
|---|---|
| URL | `.env` → `CF_IMAGE_WORKER_URL` (`https://wild-wind-67c2.abhishekkumar222106.workers.dev/`) |
| Secret | `.env` → `CF_IMAGE_WORKER_SECRET` (currently `TEST`) |

**b) Pollinations (no key at all)**

| | |
|---|---|
| URL pattern | `https://image.pollinations.ai/prompt/{prompt}` (URL-encode the prompt) |
| Example | `https://image.pollinations.ai/prompt/a%20MiG-25%20climbing%20through%20clouds` |
| Returns | the image bytes directly — save under `server/data/` and index it |

## Authentication

None. The web app is open — there is no login or signup gate; opening the
app goes straight to the Home screen.

## Key-rotation pattern (all providers)

```ts
function rotatingKeys(envVar: string) {
  const keys = (process.env[envVar] ?? '').split(',').filter(Boolean);
  let i = 0;
  return {
    current: () => keys[i % keys.length],
    advance: () => keys[++i % keys.length], // call on HTTP 429
  };
}
```

## Which model for what (summary)

| Task | First choice | Fallback |
|---|---|---|
| Beat segmentation / query building / agent chat | Groq `openai/gpt-oss-120b` | OpenRouter `tencent/hy3:free`, then local Ollama |
| Stock footage for beats | Pexels videos | Pixabay videos |
| Still imagery for unmatched beats | Cloudflare Worker | Pollinations |
| Transcription | local whisper.cpp (unchanged) | — |
| Embeddings/retrieval | local CLIP + sqlite-vec (unchanged) | — |
