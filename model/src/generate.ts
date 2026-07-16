/**
 * Text-to-video generation — DEFERRED (out of scope for v1).
 *
 * This file defines the seam only. The pipeline (stage5) produces
 * GenerationSlots; the editor shows them as placeholder blocks. When a local
 * generator becomes practical, implement VideoGenerator and register it in
 * pipeline.ts — nothing else changes:
 *
 *   contract: generate(slot) -> ClipAsset written under DATA_DIR, slot.status
 *   flipped to 'done', asset embedded + upserted into the clip index so future
 *   retrieval can reuse it.
 *
 * Candidate future backends (all must stay local/CPU-optional per the v1
 * constraints, or be an explicit opt-in): AnimateDiff-style local models,
 * ComfyUI pipelines, or a hosted API behind keys.ts.
 */

import type { ClipAsset, GenerationSlot } from '@deep-video/shared';

/** The swappable generator seam. v1 ships only the stub below. */
export interface VideoGenerator {
  readonly name: string;
  /** True when this generator can run in the current environment. */
  isAvailable(): Promise<boolean>;
  /** Produce a clip for the slot and return the indexed asset. */
  generate(slot: GenerationSlot): Promise<ClipAsset>;
}

/** v1 placeholder: reports unavailable and refuses to generate. */
export class DeferredGenerator implements VideoGenerator {
  readonly name = 'deferred';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async generate(slot: GenerationSlot): Promise<ClipAsset> {
    throw new Error(
      `Video generation is deferred in v1 (slot ${slot.id}). ` +
        'Implement VideoGenerator (model/src/generate.ts) and register it in pipeline.ts.',
    );
  }
}
