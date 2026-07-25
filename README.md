# Deep Vision

An autonomous AI video studio. Describe an idea (or connect a channel and paste
a script) and the agent crew researches, writes, sources footage, adds motion
graphics, narrates, subtitles, reviews and assembles a finished, editable video.

**Three tiers, all live.** React UI + timeline editor (`frontend/`), a Node API
gateway (`backend/`), and a Python agentic core (`core/`). The whole stack runs
with **zero API keys** — heavy AI degrades to deterministic fallbacks. Add keys
in `.env` and LLMs, stock footage, AI images, transcription and TTS light up.

## Run it

```bash
pip install -r requirements.txt
npm install

npm run dev:core       # Python core  → FastAPI  :8000
npm run dev:backend    # Node gateway → Fastify  :8787   (proxies /api → core)
npm run dev            # frontend      → Vite     :5173   (proxies /api,/files,/dev)
```

Then open http://localhost:5173.

## The workflow

```
Idea ──► Director chat ──► Setup ──► Processing ──► Editor ──► Render
        (talk it through)  (voice/    (live agent   (timeline
                            theme/     pipeline)      video editor)
                            footage)
```

1. **Connect a channel** (YouTube URL / @handle) with a niche — required, it
   tells the agents what footage to find. Each channel is a **brand profile**:
   voice, motion-template theme, footage source, compliance rules, background.
2. **Talk-first planning.** An idea opens a staged Director chat — it suggests
   specific topics, asks the length, drafts an outline you approve, then writes
   the full script. Nothing generates until you say so.
3. **Creative Setup** — confirm voice, theme, footage source and background.
4. **Generate** — the agent pipeline runs live (segment → keywords → retrieve →
   rank → pick → assemble), streamed to the Processing screen. It keeps running
   in the background and shows on Home; reopening resumes the view.
5. **Editor** — a full timeline video editor (layers, drag/trim/split, captions,
   agent chat, render to MP4). "Fill missing footage" resumes any scenes a run
   left uncovered without redoing the rest.

Toggle **Developer Mode** (bottom-right) for a live, project-scoped telemetry
dashboard: workflow graph, agent monitor, LLM+prompt feed, API/rate-limit
monitor, logs, performance.

## Layout

```
frontend/   React + Vite + Zustand app and the timeline video editor
shared/types/  data model (EDL/timeline, run, API contracts) — imported as
               "@deep-vision/shared" by the frontend and backend
backend/    Fastify gateway (:8787): serves /api, proxies AI to the core,
            handles uploads/projects/clips/render, serves media at /files
core/       Python FastAPI (:8000) + agents + orchestrator + providers +
            memory + tools. Entry: core/main.py
apps/       desktop (Electron) + web wrappers (scaffold)
assets/     fonts, music, sfx, transitions, overlays, templates, backgrounds
cache/ downloads/ temp/ logs/ projects/   runtime data — gitignored (.gitkeep)
```

See [CLAUDE.md](CLAUDE.md) for the full core map (which chapter/agent lives where).

## Keys (all optional)

Copy `.env.example` to `.env` and fill in what you have — the app runs without
any of them, each key just upgrades a capability:

| Key | Powers |
|-----|--------|
| `OPENROUTER_API_KEYS` / `GROQ_API_KEYS` | LLM (planning, scripts, keywords) — rotated on rate-limit |
| `PEXELS_API_KEYS` / `PIXABAY_API_KEYS` | stock video + image search |
| `CF_IMAGE_WORKER_URL` / `POLLINATIONS_IMAGE_URL` | AI image generation |
| `VITE_YOUTUBE_API_KEY` (+ `_BACKUP`) | channel resolve + subscriber stats |

Keys live in `.env` / `frontend/.env` and are **gitignored** — never committed.
Free-tier quotas are documented in `core/providers/api_manager.py`; runs pace
themselves to stay inside them and wait-and-retry when a provider throttles.

## Commands

```bash
npm run dev            # frontend (also: npm run dev:backend, npm run dev:core)
npm run typecheck      # frontend + backend TS
python tests/check_timeline_export.py   # guards the render graph
```
