# Deep Video

Local-first, retrieval-first video assembly. Give it a script or narration
audio; it transcribes, splits the story into beats, finds the best-matching
clip for each beat from your own footage or free stock (matching what's said
AND what's shown), assembles a timeline aligned to the audio, and opens it in
an editor you refine. Beats with no good match keep a placeholder slot for
future generation — generation itself is deferred in v1.

Everything runs on your machine: whisper.cpp, CLIP (transformers.js),
sqlite-vec, Ollama, ffmpeg. No cloud, no keys, no GPU required.

## Prerequisites

- **Node 20+** and npm
- **ffmpeg / ffprobe** on PATH (`ffmpeg -version`)
- **Ollama** running locally (`ollama serve`, then `ollama pull llama3.1`)
  — only needed once the pipeline is implemented

## Setup

```bash
npm install          # installs all workspaces (shared, model, server) + frontend
cp .env.example .env # already provided with local defaults
```

## Run (dev)

```bash
npm run dev          # React editor  -> http://localhost:5173
npm run server       # Fastify API   -> http://localhost:8787 (separate terminal)
npm run typecheck    # typecheck every workspace
```

The frontend currently runs fully on design mock data; server endpoints other
than `/api/health` return `501 { notImplemented: true }` until implemented.

## Repository layout

```
shared/   types only — EDL/timeline, pipeline, API contracts (source of truth)
model/    agent pipeline: segment -> queries -> retrieve -> rerank -> pick -> history
server/   Fastify + whisper.cpp + CLIP + sqlite-vec + ffmpeg (all local I/O)
src/      React editor (Vite), currently the fully implemented UI
docs/     architecture notes
```

Each package has its own `CLAUDE.md` — read it before working in that package.

## Intended build order

1. **shared** — types (done; extend as needed, never duplicate elsewhere)
2. **server/render.ts** `probe` + `extractFrames` (ffprobe/ffmpeg basics)
3. **server/db.ts** — sqlite-vec index (add `better-sqlite3`, `sqlite-vec`)
4. **server/clip.ts** — CLIP embedder (add `@xenova/transformers`); then
   `POST /api/clips/index` + `/api/clips/search` end-to-end
5. **server/transcribe.ts** — whisper.cpp (add `nodejs-whisper`)
6. **model/llm.ts** — Ollama chat + tool loop; then stages 1→6 and
   `model/timeline.ts`; wire `POST /api/pipeline/run`
7. **server/render.ts** `renderTimeline` — timeline → mp4
8. Wire frontend `src/services/*` to real endpoints (replace mock data)
9. **Deferred:** implement a `VideoGenerator` (model/src/generate.ts) to fill
   GenerationSlots; optional Piper TTS (server/src/tts.ts)

Heavy native deps (`better-sqlite3`, `sqlite-vec`, `@xenova/transformers`,
`nodejs-whisper`) are intentionally NOT installed by the scaffold — add each
when you reach its step so installs stay fast and Windows toolchain issues
surface one at a time.
