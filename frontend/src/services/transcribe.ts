/** Client for POST /api/transcribe. Server side is stubbed (501) for now. */

import type { CaptionCue, TranscribeRequest, TranscribeResponse, UploadAudioResponse } from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';

export function transcribe(req: TranscribeRequest): Promise<TranscribeResponse> {
  return fetchJson<TranscribeResponse, TranscribeRequest>('/api/transcribe', { body: req });
}

/** Upload narration audio for a generation run; returns its server path + duration. */
export async function uploadAudio(file: File): Promise<UploadAudioResponse> {
  const form = new FormData();
  form.append('file', file, file.name);
  let res: Response;
  try {
    res = await fetch('/api/audio/upload', { method: 'POST', body: form });
  } catch {
    // fetch() rejects (not an HTTP error) when the gateway is unreachable.
    throw new Error('Can’t reach the server — start the backend: npm run dev:backend');
  }
  const json = (await res.json()) as UploadAudioResponse | { error: string };
  if (!res.ok) throw new Error('error' in json ? json.error : `upload failed (${res.status})`);
  return json as UploadAudioResponse;
}

/** Speech in a media file (video or audio) → timed caption cues. */
export function generateCaptions(
  path: string,
  language?: string,
): Promise<{ cues: CaptionCue[]; language: string; text: string }> {
  return fetchJson('/api/captions/generate', { body: { path, language } });
}
