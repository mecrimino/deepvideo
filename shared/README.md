# shared/

Cross-cutting code shared by `frontend/`, `backend/`, and `apps/`.

- `types/`      — the data model (EDL/timeline, run, API contracts). **In use
  today**: the frontend imports it as `@deep-vision/shared` (aliased in
  `frontend/vite.config.ts` + `frontend/tsconfig.json`).
- `constants/`  — shared constants (placeholder).
- `interfaces/` — shared interfaces/DTOs (placeholder).
- `utils/`      — framework-agnostic helpers (placeholder).
