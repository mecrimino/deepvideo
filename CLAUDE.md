# Deep Vision — root guide

**Monorepo, three tiers, all live.** The React UI + timeline editor (`frontend/`),
a Node API gateway (`backend/`), and a Python agentic core (`core/`) built from
the 20-chapter design in *The Core of Agentic Video Editing*. The whole stack
runs with **zero API keys** — heavy AI degrades to deterministic fallbacks
(Ch20). Add keys in `.env` and LLM/stock/ASR light up.

## Run it

```
pip install -r requirements.txt
npm install
npm run dev:core       # Python core  → FastAPI  :8000
npm run dev:backend    # Node gateway → Fastify   :8787   (proxies /api to core)
npm run dev            # frontend      → Vite      :5173   (proxies /api,/files → 8787)
```

## Layout

```
frontend/   React + Vite + Zustand app and the video editor      ← WORKING
shared/
  types/      data model (EDL/timeline, run, API contracts).
              Imported by the frontend as "@deep-vision/shared"
              (aliased in frontend + backend tsconfig/vite).
backend/    Fastify gateway (:8787): serves all /api, proxies AI to core,   ← WORKING
            handles uploads/projects/clips/render, serves media at /files.
core/       Python FastAPI (:8000) + agents + orchestrator + providers +    ← WORKING
            memory + tools. Entry core/main.py.
apps/       desktop (Electron) + web wrappers (scaffold, empty)
assets/ cache/ projects/ downloads/ temp/ logs/ tests/ docs/ scripts/
```

## core/ map (which chapter lives where)

```
core/config.py            settings + .env, all keys optional (Ch3/Ch20)
core/schemas/             pydantic contracts; edl.py mirrors shared/types (Ch2.12)
core/providers/           api_manager (Ch20.7 retry/cache/rotation), llm/ router
                          (OpenRouter+Groq, Ch1.7), search/ stock (Pexels+Pixabay),
                          storage/ (shared cache/clips.json asset catalog)
core/memory/              working + vector + graph + hashed embedder (Ch7)
core/tools/               ffmpeg, transcriber (Groq Whisper), downloader (Ch5)
core/orchestrator/        state machine, events, run/render registries,
                          pipeline.py (the 6-stage run), render.py (Ch19/Ch20)
core/agents/              director(Ch5) planner(Ch6) research(Ch9) script scene(Ch11)
                          image(Ch12) video(Ch13) vision(Ch14) timeline(Ch15)
                          graphics(Ch16) audio+subtitle(Ch17) reviewer(Ch18)
                          exporter(Ch20) chat
```

The pipeline (`core/orchestrator/pipeline.py`) turns script|audio|idea into the
editor's `Timeline`: `segment → queries → retrieve → rerank → pick → history`,
expanding a short idea via Director→Research→Script first, and running an audio/
subtitle/review pass at the end. The Exporter renders a `Timeline` to MP4 as
ONE positioned ffmpeg graph: clips sit at their real start times (gaps stay
black), overlay lanes composite over the base, audio lanes mix in at their
offsets. `python tests/check_timeline_export.py` guards all three.

`cache/ downloads/ temp/ logs/ projects/` are runtime data — gitignored, dirs
kept via `.gitkeep`.

## frontend/src taxonomy

- `pages/`      — Home, Theme, Setup, Processing (flow UI shells; the pipeline
  they drove is gone, so `services/*` calls fail gracefully).
- `editor/`     — the timeline video editor (kept as one cohesive module):
  TopBar, IconRail, panels, Preview, Timeline tracks, TransportBar, AgentChat,
  dialogs. `dnd.ts` is the single drag channel (assets, repo files, look and
  shot presets) and `Timeline/useLaneDrop.ts` is what every lane does with a
  drop — including OS files, which upload then land. Visual lanes and audio
  lanes are both `FilmTrack`; clips never cross between the two kinds.
- `stores/`     — Zustand: `useAppStore` (flow) + `useEditorStore` (document).
- `services/`   — backend clients (currently no-op / fail gracefully).
- `utils/`      — pure helpers (format, credits, channel, fetchJson).
- `styles/`     — `theme.ts` (design tokens) + `index.css`.
- `components/` — reusable UI. `data/` — seed/mock data. `hooks/`, `assets/`,
  `layouts/` — empty buckets ready to fill. `router.ts` — URL ⇄ store routing.

## Conventions

- Times are seconds (float); intervals half-open `[startSec, endSec)`. Ids are
  opaque strings.
- TS strict; ESM; 2-space indent. Styling: `shared`? no — design tokens in
  `frontend/src/styles/theme.ts` + inline styles; hover utils in `index.css`.

## Commands (from repo root)

- `npm install` · `npm run dev` (Vite :5173) · `npm run typecheck`
  — all proxy to the `frontend` workspace.

## Rebuilding the core

Target `shared/types/api.ts`; `frontend/src/services/*` will light up. Re-add a
`/api` dev proxy to `frontend/vite.config.ts` when `backend/` serves..
