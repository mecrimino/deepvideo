# model/src/deepvideov1mini — the v1 Mini full-video model

Implements the "Deep Video v1 Clip-Matching Pipeline Spec": script/audio in →
correctly-matched stock B-roll timeline out, ≥95% right via verify-and-flag
(not via trusting any single automated guess).

## Stages (spec step → file)

0. idea→script (Mini extension)      `step0_script.ts`   Groq writes narration if input is a short idea
1. segmentation                      `step1_transcribe.ts` clause boundaries: `.?!`, `, +conjunction`, >0.4s pause, 8s cap
2. niche detection (1x/project)      `step2_niche.ts`    Prompt 1, first 500 chars, Groq openai/gpt-oss-120b
3. keyword per segment               `step3_keyword.ts`  Prompt 2, OpenRouter tencent/hy3:free (fallback: Groq, then heuristic)
4. multi-candidate retrieval         `step4_retrieve.ts` Pexels+Pixabay top-15 each, pooled, deduped
5. CLIP re-ranking                   `step5_rerank.ts`   keyword text-embed vs thumbnail image-embed, cosine
6. threshold + fallback              `step6_pick.ts`     below threshold: broaden keyword once, else status 'review'
7. anti-repetition                   `step7_history.ts`  soft penalty on already-used clip ids

`pipeline.ts` (`runMiniMatching`) maps these onto the shared `PipelineRun`
stages (segment/queries/retrieve/rerank/pick) and leaves `history` pending —
the SERVER finishes it (downloads picked clips into the library, assembles the
`Timeline`, persists the run). See `server/src/mini/run.ts`.

## Injected deps (types.ts) — implemented in server/src/mini/

`MiniLLM` (Groq + OpenRouter with key rotation) · `StockSearch` (Pexels+Pixabay
+ api cache) · `TextImageEmbedder` (real CLIP via @xenova/transformers) ·
`UsageStore` (used-clips log).

## Calibration

Spec numbers (0.75 threshold / 0.15 penalty) are open_clip-scale; real CLIP
ViT-B/32 text↔image cosines run ~0.18-0.33, so defaults here are 0.26 / 0.05
(`config.ts` explains). Tune via `MiniSettings`, don't trust either blindly.

## Statuses

`auto` · `auto-fallback` (broadened keyword) · `review` (below threshold —
yellow outline in the editor, still placed) · `none` (no candidate →
GenerationSlot). Only non-review picks are committed to the usage log.
