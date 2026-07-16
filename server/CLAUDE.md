# @deep-video/server — local I/O services

Fastify API on **http://localhost:8787** wrapping everything that touches disk,
native binaries, or models. The frontend proxies `/api` here (vite.config.ts).
All storage is local files under `server/data/` (gitignored).

## Modules (all STUBS except the route table)

- `src/index.ts` — Fastify entry; routes registered + typed, handlers return
  501 `{ notImplemented: true }` until their module is built. `/api/health` works.
- `src/db.ts` — sqlite-vec clip index (`data/deepvideo.db`). Schema sketch in file.
- `src/clip.ts` — CLIP embeddings via `@xenova/transformers` (CPU, offline).
- `src/transcribe.ts` — whisper.cpp via `nodejs-whisper`, word timestamps.
- `src/tts.ts` — optional Piper TTS (script → narration audio).
- `src/render.ts` — ffprobe/frame-extraction/ffmpeg render via child_process.

## Endpoints

`GET /api/health` · `POST /api/transcribe` · `POST /api/clips/index` ·
`POST /api/clips/search` · `GET /api/clips` · `POST /api/pipeline/run` ·
`GET /api/pipeline/run/:id` · `POST /api/render` · `GET|POST /api/project`.
Contracts live in `@deep-video/shared` (src/api.ts) — change them there first.

## Dependencies

Installed: `fastify`, `@deep-video/shared`, `tsx` (dev).
**Add when implementing** (deliberately not installed yet — native builds):
`better-sqlite3`, `sqlite-vec`, `@xenova/transformers`, `nodejs-whisper`.
External binaries: `ffmpeg`/`ffprobe` on PATH; Ollama running locally.

## Run / test

- `npm run dev -w @deep-video/server` (or root `npm run server`) → tsx watch
- `curl http://localhost:8787/api/health`
- `npm run typecheck -w @deep-video/server`

## Build order

render.probe → db.ts → clip.ts → clips/index+search routes → transcribe.ts →
pipeline/run route (inject into @deep-video/model) → render.renderTimeline → tts.
