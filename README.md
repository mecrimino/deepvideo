# Deep Vision

AI video creation studio. Monorepo. **Today only `frontend/` is live** — the
complete React app and timeline **video editor**. The generation core (agent
pipeline, backend API, providers, persistence) has been cleared and is being
rebuilt into `backend/` and `core/`.

## Structure

```
frontend/     React app + timeline video editor   ← WORKING
shared/       cross-cutting code
  types/        data model (EDL/timeline, run, API) — used by the frontend
                as "@deep-vision/shared"
backend/      API, websocket, queue, scheduler, auth, database   (scaffold)
core/         Python agent pipeline + orchestrator + providers   (scaffold)
apps/         desktop (Electron) + web wrappers                  (scaffold)
assets/       fonts, music, sfx, transitions, overlays, templates
cache/        images, voices, videos, thumbnails, embeddings, api  (runtime)
projects/     per-project working data                            (runtime)
downloads/    youtube, pixabay, pexels, unsplash                  (runtime)
temp/         render, upload, extraction, processing              (runtime)
logs/         backend, agents, api, renderer                      (runtime)
tests/  docs/  scripts/
```

`cache/ downloads/ temp/ logs/ projects/` hold generated data and are
gitignored (the dirs are kept via `.gitkeep`).

## Run the frontend

```bash
npm install                # installs the frontend workspace
npm run dev                # Vite → http://localhost:5173
npm run typecheck
```

(or `cd frontend && npm run dev`)

### What works
The full UI: Home → Theme → Setup → Processing → Editor, each on its own URL,
and the client-side timeline **video editor** (layers, drag/trim/split,
playback, zoom, undo/redo, captions, panels, agent chat UI). Anything that
needed the backend (running a generation, export/render, save, media, stock
search) is stubbed and fails gracefully until the core is rebuilt.

## Rebuilding the core

Target the contracts in `shared/types/api.ts`; the clients in
`frontend/src/services/*` will light up. Re-add a `/api` dev proxy in
`frontend/vite.config.ts` once `backend/` serves.
