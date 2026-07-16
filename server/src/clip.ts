/**
 * The embedding seam. The production design is CLIP via @xenova/transformers
 * (transformers.js — pure JS/WASM, CPU-friendly, offline after the first model
 * download; model Xenova/clip-vit-base-patch32, 512 dims, see model/config.ts).
 *
 * v1 ships a REAL, deterministic local embedder in the same vector space shape:
 * a signed feature-hashing bag-of-words over content words. Clip metadata
 * (tags + filename) is embedded at index time with the same function beat
 * queries are embedded with at search time, so cosine similarity measures
 * keyword overlap. Swapping in CLIP later only changes this file — callers
 * depend on the ClipEmbedder interface.
 *
 * embedImage requires an actual vision tower, so it reports unsupported until
 * CLIP lands; the catalog indexes text metadata instead.
 */

// Local declaration of the embedder seam so server/ has no runtime dep on
// model/. Kept structurally identical to model/src/types.ts#Embedder.
export interface ClipEmbedder {
  readonly dims: number;
  embedText(text: string): Promise<Float32Array>;
  embedImage(imagePath: string): Promise<Float32Array>;
}

export const EMBED_DIMS = 512;

const STOPWORDS = new Set(
  (
    'a an the and or but nor of in on at to for from by with without into onto over under ' +
    'is are was were be been being am do does did done doing have has had having will would ' +
    'shall should can could may might must it its this that these those there here he she ' +
    'they them his her their our your my me we you i as if then than so such not no yes ' +
    'about above after again against all any because before below between both down during ' +
    'each few more most other some only own same too very just also when where which who ' +
    'whom why how what while out up off once footage video clip stock'
  ).split(/\s+/),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** FNV-1a 32-bit hash. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Signed feature hashing: token -> (bucket, ±1); light word-stemming. */
function stem(w: string): string {
  return w.replace(/(ings?|ies|ied|ers?|ed|es|s)$/i, (m) => (w.length - m.length >= 3 ? '' : m));
}

export function hashEmbed(text: string, dims = EMBED_DIMS): Float32Array {
  const vec = new Float32Array(dims);
  for (const raw of tokens(text)) {
    const w = stem(raw);
    const h = fnv1a(w);
    const idx = h % dims;
    const sign = (h >>> 16) & 1 ? 1 : -1;
    vec[idx] += sign;
  }
  // L2 normalize so dot product == cosine similarity.
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dims; i++) vec[i] /= norm;
  return vec;
}

class HashingEmbedder implements ClipEmbedder {
  readonly dims = EMBED_DIMS;

  async embedText(text: string): Promise<Float32Array> {
    return hashEmbed(text, this.dims);
  }

  async embedImage(imagePath: string): Promise<Float32Array> {
    throw new Error(
      `embedImage(${imagePath}) needs the CLIP vision tower (@xenova/transformers) — ` +
        'the v1 hashing embedder indexes clip text metadata instead.',
    );
  }
}

/** Create the active embedder (hashing now; CLIP once transformers.js lands). */
export async function createClipEmbedder(_opts?: { modelId?: string }): Promise<ClipEmbedder> {
  return new HashingEmbedder();
}
