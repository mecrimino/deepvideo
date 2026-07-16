# Deep Video — root guide

Read this first every session. Then read ONLY the CLAUDE.md of the package you
are working in — the per-package files are the source of truth for their area;
you should not need to load the whole codebase.

## What Deep Video does

Script or narration audio → transcribe (whisper.cpp) → split into **beats** →
for each beat retrieve the best-matching clip (user footage or free stock),
matching on both what's **said** and what's **shown** (CLIP shared text/image
space) → assemble a timeline aligned to the audio → open in a React editor for
refinement. When no clip clears the match threshold, the beat keeps a
**GenerationSlot** placeholder — video generation is DEFERRED behind a clean
interface (model/src/generate.ts), not implemented.

## Hard constraints (v1)

- **100% local and free.** No cloud services, no hosted APIs, no paid keys, no
  database server. `model/src/keys.ts` stays empty.
- **CPU-friendly.** Never assume a GPU.
- **Retrieval-first.** Finding/using existing clips is in scope; generating
  video is not (interface only).

## Stack (exact — do not substitute)

Node 20 + TypeScript, npm workspaces · ffmpeg/ffprobe via child_process ·
whisper.cpp via `nodejs-whisper` · CLIP via `@xenova/transformers` ·
`sqlite-vec` (single local file) · Ollama (OpenAI-compatible endpoint,
tool-calling loop) · Fastify · React + Vite + Zustand · storage under
`server/data/` (gitignored).

## Folder map

- `shared/`  — **@deep-video/shared**: types only (EDL/timeline, pipeline, API
  contracts). Everything imports these; never duplicate them.
- `model/`   — **@deep-video/model**: the agent pipeline (stages 1–6, timeline
  ops, LLM seam, deferred generator seam). Pure logic; deps injected.
- `server/`  — **@deep-video/server**: Fastify on :8787; whisper, CLIP,
  sqlite-vec, ffmpeg render. The only package that touches disk/binaries.
- `src/`     — the React editor frontend (root Vite app, :5173, proxies /api).
- `public/`  — static assets (music/, sfx/).
- `docs/`    — architecture notes and decisions.

## How modules connect

frontend `src/services/*` → HTTP → `server` routes → call `model.runPipeline`
with injected `{ llm: OllamaClient, embedder (clip.ts), index (db.ts) }` →
returns a `Timeline` (shared types) → editor renders/edits it → `POST
/api/render` → ffmpeg → `server/data/exports/`.

## Conventions

- One package = one responsibility; expose a small typed surface via
  `src/index.ts`, hide internals.
- Swappable seams are interfaces: `LLMClient` (Ollama→Claude later),
  `Embedder`/`ClipIndex` (CLIP/sqlite-vec), `VideoGenerator` (deferred).
  Callers depend on the interface, never the implementation.
- Times are seconds (float); intervals half-open. Ids are opaque strings.
- Stubs throw `NotImplementedError` (model) or return 501
  `{ notImplemented: true }` (server) — grep `TODO(` to find work.
- TypeScript strict everywhere; ESM (`"type": "module"`); 2-space indent.
- Frontend styling: design tokens in `src/theme.ts` + inline styles matching
  the design file `Deep Video.dc.html`; hover utilities in `src/index.css`.

## Commands

- `npm install` (root, once) · `npm run dev` (frontend) · `npm run server`
  (API) · `npm run typecheck` (all workspaces).
