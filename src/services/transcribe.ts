/** Client for POST /api/transcribe. Server side is stubbed (501) for now. */

import type { TranscribeRequest, TranscribeResponse } from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function transcribe(req: TranscribeRequest): Promise<TranscribeResponse> {
  return fetchJson<TranscribeResponse, TranscribeRequest>('/api/transcribe', { body: req });
}
