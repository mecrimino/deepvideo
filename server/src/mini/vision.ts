/**
 * Step 5 backend — REAL CLIP (ViT-B/32) via @xenova/transformers.
 *
 * Text and thumbnails are embedded into one shared space and L2-normalized so
 * dot product == cosine similarity. Runs fully on CPU (onnxruntime); the
 * quantized model weights (~150 MB) download once into DATA_DIR/models and
 * are reused offline afterwards. Loading is lazy: the server boots instantly
 * and the first rerank call pays the model-load cost.
 */

import path from 'node:path';
import type { mini } from '@deep-video/model';
import { DATA_DIR } from '../paths.js';

type TextImageEmbedder = mini.TextImageEmbedder;

const MODEL_ID = 'Xenova/clip-vit-base-patch32';

interface ClipStack {
  tokenizer: import('@xenova/transformers').PreTrainedTokenizer;
  textModel: InstanceType<typeof import('@xenova/transformers').CLIPTextModelWithProjection>;
  processor: import('@xenova/transformers').Processor;
  visionModel: InstanceType<typeof import('@xenova/transformers').CLIPVisionModelWithProjection>;
  RawImage: typeof import('@xenova/transformers').RawImage;
}

let stackPromise: Promise<ClipStack> | null = null;

async function loadStack(): Promise<ClipStack> {
  if (!stackPromise) {
    stackPromise = (async () => {
      const tf = await import('@xenova/transformers');
      tf.env.cacheDir = path.join(DATA_DIR, 'models');
      tf.env.allowLocalModels = false;
      const [tokenizer, textModel, processor, visionModel] = await Promise.all([
        tf.AutoTokenizer.from_pretrained(MODEL_ID),
        tf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID),
        tf.AutoProcessor.from_pretrained(MODEL_ID),
        tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID),
      ]);
      return { tokenizer, textModel, processor, visionModel, RawImage: tf.RawImage };
    })();
    stackPromise.catch(() => {
      stackPromise = null; // allow a retry after a failed download
    });
  }
  return stackPromise;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/** True when the CLIP weights are present or downloadable (network needed once). */
export async function clipVisionReady(): Promise<boolean> {
  try {
    await loadStack();
    return true;
  } catch {
    return false;
  }
}

export function createClipVision(): TextImageEmbedder {
  return {
    async embedText(text: string): Promise<Float32Array> {
      const { tokenizer, textModel } = await loadStack();
      const inputs = tokenizer([text], { padding: true, truncation: true });
      const out = (await textModel(inputs)) as { text_embeds: { data: Float32Array } };
      return l2Normalize(new Float32Array(out.text_embeds.data));
    },

    async embedImageUrl(url: string): Promise<Float32Array> {
      const { processor, visionModel, RawImage } = await loadStack();
      const image = await RawImage.read(url);
      const inputs = await processor(image);
      const out = (await visionModel(inputs)) as { image_embeds: { data: Float32Array } };
      return l2Normalize(new Float32Array(out.image_embeds.data));
    },
  };
}
