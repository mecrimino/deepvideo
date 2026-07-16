/**
 * sqlite-vec access — the clip index. A single local file
 * (server/data/deepvideo.db), no database server.
 *
 * Planned schema:
 *   clips(id TEXT PK, path, duration_sec, width, height, fps, tags JSON,
 *         thumb_path, source, license)
 *   frames(clip_id, t_sec, embedding vec_f32[512])   -- one row per sampled frame
 *   vec index over frames.embedding (CLIP image tower, shared space with text)
 *
 * TODO(implement): add deps `better-sqlite3` + `sqlite-vec`, load the extension,
 * create tables on first open. Keep everything synchronous (better-sqlite3)
 * behind this async facade so callers never change.
 */

import type { ClipAsset, MatchCandidate } from '@deep-video/shared';

export interface ClipDb {
  upsertClip(asset: ClipAsset): Promise<void>;
  /** Store one sampled frame's CLIP embedding for a clip. */
  insertFrameEmbedding(clipId: string, tSec: number, embedding: Float32Array): Promise<void>;
  /** kNN search over frame embeddings; aggregates hits per clip. */
  search(embedding: Float32Array, topK: number): Promise<MatchCandidate[]>;
  getAssets(ids: string[]): Promise<ClipAsset[]>;
  listAssets(): Promise<ClipAsset[]>;
  close(): Promise<void>;
}

/** Open (and on first run, create) the index at `${DATA_DIR}/deepvideo.db`. */
export async function openDb(_dbPath: string): Promise<ClipDb> {
  throw new Error('TODO(server/db.openDb): not implemented — see server/CLAUDE.md');
}
