# Deep Video — architecture

Longer-form design notes. The per-package CLAUDE.md files stay short; depth
lives here.

## Data flow

```
            script (typed)                narration audio (recorded)
                 │                                   │
                 │                        server/transcribe.ts (whisper.cpp)
                 │                                   │
                 └──────────────┬────────────────────┘
                                ▼
              model/stage1_segment  ── Beat[] (id, text, TimeRange)
                                ▼
              model/stage2_queries  ── per beat: { said, shown } queries
                                ▼
              model/stage3_retrieve ── CLIP text-embed queries, kNN sqlite-vec
                                ▼
              model/stage4_rerank   ── combined = (1-w)*text + w*visual,
                                       penalties: duration, reuse, aspect
                                ▼
              model/stage5_pick     ── score ≥ matchThreshold ? clip : GenerationSlot
                                ▼
              model/stage6_history  ── persist PipelineRun JSON (DATA_DIR)
                                ▼
              model/timeline.assembleFromPicks ── Timeline (shared EDL)
                                ▼
              React editor (src/) ── refine: trim, swap, reorder, captions
                                ▼
              server/render.ts ── ffmpeg filter_complex → data/exports/*.mp4
```

## Why beats

A beat is the smallest visual unit: one clip per beat. Segmenting on visual
boundaries (not sentences) keeps retrieval focused — "the MiG-25 climbs" and
"engineers panic on the ground" want different footage even if they share a
sentence.

## Said vs shown

Every beat gets two queries embedded into CLIP's shared text/image space:

- **said** — semantic content of the narration; matches clips whose indexed
  frames/metadata express the same meaning.
- **shown** — a director's description of desired imagery; matches visual
  composition directly.

Clip index side: at index time we sample N frames per clip (ffmpeg), embed each
with the CLIP image tower, and store one vector row per frame in sqlite-vec.
Search aggregates frame hits per clip (max or mean-top-k) so long clips don't
dominate. textScore/visualScore in `MatchCandidate` come from the said/shown
queries respectively.

## Retrieve-or-generate

stage5 accepts the best reranked candidate iff `combined ≥ matchThreshold`
(default 0.62 — tune in model/src/config.ts). Otherwise the beat keeps a
`GenerationSlot { prompt, durationSec, status:'pending' }`:

- the editor renders slots as labeled placeholder blocks;
- the render burns a color card with the prompt text;
- a future `VideoGenerator` fills slots without touching any other code.

A visible placeholder beats a misleading clip.

## Swappable seams (interfaces, not implementations)

| Seam | Interface | v1 impl | Future |
|------|-----------|---------|--------|
| Agent LLM | `LLMClient` (model/src/llm.ts) | `OllamaClient` (OpenAI-compatible endpoint) | Claude client |
| Embedder | `Embedder` (model/src/types.ts) | CLIP via transformers.js (server/src/clip.ts) | bigger CLIP/SigLIP |
| Clip index | `ClipIndex` (model/src/types.ts) | sqlite-vec (server/src/db.ts) | any vector store |
| Generator | `VideoGenerator` (model/src/generate.ts) | `DeferredGenerator` (refuses) | local T2V / hosted |

model/ receives all four via `runPipeline(deps, input)` — it never imports
server code, native modules, or network SDKs directly (except the LLM client it
defines itself).

## sqlite-vec schema (planned)

```sql
CREATE TABLE clips (
  id TEXT PRIMARY KEY, path TEXT, duration_sec REAL,
  width INT, height INT, fps REAL,
  tags TEXT,           -- JSON array
  thumb_path TEXT, source TEXT, license TEXT
);
CREATE VIRTUAL TABLE frames USING vec0(
  clip_id TEXT, t_sec REAL,
  embedding float[512]              -- CLIP ViT-B/32 shared space
);
```

Single file `server/data/deepvideo.db`; accessed only through `server/src/db.ts`.

## Decisions log

- **2026-07-16** Monorepo layout: `shared/`, `model/`, `server/` as npm
  workspaces; frontend lives at root `src/` (Vite convention, matches brief).
- **2026-07-16** Heavy native deps not installed by scaffold; added per build
  step (see README build order).
- **2026-07-16** UI implemented from `Deep Video.dc.html` (Claude Design
  project) on mock data; services layer typed but stubbed.
- **2026-07-16** Frontend state: Zustand single store mirroring the design's
  screen-state machine (home → theme → setup → processing → editor).
