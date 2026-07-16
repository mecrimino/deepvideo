/**
 * CLIP embeddings via @xenova/transformers (transformers.js) — pure JS/WASM,
 * CPU-friendly, fully offline after the first model download.
 *
 * Text and images are embedded into ONE shared vector space
 * (model: Xenova/clip-vit-base-patch32, 512 dims — see model/config.ts), which
 * is what lets a beat's text query find visually matching footage.
 *
 * TODO(implement): add dep `@xenova/transformers`; use CLIPTextModelWithProjection
 * + CLIPVisionModelWithProjection, L2-normalize outputs. Sample frames from
 * videos with ffmpeg (server/render.ts helpers) before embedding.
 */

// Local declaration of the embedder seam so server/ has no runtime dep on
// model/. Kept structurally identical to model/src/types.ts#Embedder.
export interface ClipEmbedder {
  readonly dims: number;
  embedText(text: string): Promise<Float32Array>;
  embedImage(imagePath: string): Promise<Float32Array>;
}

/** Load the CLIP model (cached under DATA_DIR/models after first run). */
export async function createClipEmbedder(_opts?: { modelId?: string }): Promise<ClipEmbedder> {
  throw new Error('TODO(server/clip.createClipEmbedder): not implemented — see server/CLAUDE.md');
}
