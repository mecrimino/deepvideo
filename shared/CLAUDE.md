# @deep-video/shared

Types-only package. The single source of truth for every cross-package shape.
No runtime code, no dependencies, nothing to build.

## Responsibility

- `src/edl.ts` — EDL/timeline domain: `TimeRange`, `Word`, `Transcript`, `Beat`,
  `BeatQueries`, `ClipAsset`, `GenerationSlot`, `ClipSource`, `TimelineClip`,
  `Track`, `CaptionCue`, `Timeline`, `Project`.
- `src/pipeline.ts` — pipeline run shapes: `PipelineStage`, `StageResult`,
  `MatchCandidate`, `PickDecision`, `PipelineRun`, `PipelineSettings`.
- `src/api.ts` — request/response contracts for every server endpoint
  (`TranscribeRequest`, `SearchClipsRequest`, `RenderRequest`, ...).

## Rules

- All times are **seconds** (float) on the project clock; intervals are
  half-open `[startSec, endSec)`.
- Never duplicate these types in another package — import them:
  `import type { Timeline } from '@deep-video/shared'`.
- Adding a field is fine; renaming/removing one requires checking model/,
  server/, and src/ (they all import from here).
- Keep this package dependency-free and side-effect-free.

## Consumers

- `model/` — pipeline stages produce/consume these types.
- `server/` — route handlers are typed against `api.ts`.
- `src/` (frontend) — services and the editor state use them via the
  `@deep-video/shared` alias (see root `tsconfig.json` + `vite.config.ts`).

## Run / test

- `npm run typecheck -w @deep-video/shared`
