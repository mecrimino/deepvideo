# @deep-video/model — the agent pipeline (the brain)

Turns a script/transcript into a timeline of matched clips. Pure logic + LLM
calls; **no native deps, no file/db access** — storage and embedding are
injected as interfaces so this package is testable and swappable.

## Pipeline (all currently STUBS throwing NotImplementedError)

1. `stage1_segment.ts` — script/transcript → `Beat[]`
2. `stage2_queries.ts` — beat → `{said, shown}` queries (CLIP text space)
3. `stage3_retrieve.ts` — kNN search the clip index per beat
4. `stage4_rerank.ts` — combine text+visual scores, penalties (reuse, duration)
5. `stage5_pick.ts` — accept best clip or leave a `GenerationSlot` (threshold in config)
6. `stage6_history.ts` — persist runs as JSON under DATA_DIR

`pipeline.ts` orchestrates 1→6, then `timeline.assembleFromPicks` builds the EDL.

## Public interface (src/index.ts)

- `runPipeline(deps, input)` — deps = `{ llm, embedder, index, generator? }`
- `OllamaClient` / `LLMClient` — the LLM seam (Ollama now, Claude later)
- `DeferredGenerator` / `VideoGenerator` — generation seam, **DEFERRED in v1**
- timeline ops: `createTimeline`, `assembleFromPicks`, `insertClip`, `trimClip`, …
- `DEFAULT_SETTINGS` (thresholds/weights) in `config.ts`; `keys.ts` empty in local mode

## Dependencies

- `@deep-video/shared` (types only). Nothing else. The `Embedder` and
  `ClipIndex` interfaces (src/types.ts) are implemented in server/ and injected.

## Implementation order (when building this package)

llm.ts (fetch to Ollama /chat/completions) → stage1 → stage2 → timeline.ts →
stage3/4/5 (needs server's embedder+index working) → stage6 → captions.ts.
generate.ts stays a stub until generation is un-deferred.

## Run / test

- `npm run typecheck -w @deep-video/model`
