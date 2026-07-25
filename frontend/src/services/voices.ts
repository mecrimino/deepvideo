/** Client for narration voices (local Kokoro TTS, proxied via the gateway). */

import type { VoicesResponse } from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';

/** Available narration voices + whether the TTS server is up. */
export function listVoices(): Promise<VoicesResponse> {
  return fetchJson<VoicesResponse>('/api/voices');
}

/** URL of a short audible sample for one voice (feed an <audio> element). */
export function voicePreviewUrl(voice: string): string {
  return `/api/voice/preview/${encodeURIComponent(voice)}`;
}
