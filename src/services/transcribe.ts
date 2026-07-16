/** Client for POST /api/transcribe. Server side is stubbed (501) for now. */

import type { TranscribeRequest, TranscribeResponse, UploadAudioResponse } from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function transcribe(req: TranscribeRequest): Promise<TranscribeResponse> {
  return fetchJson<TranscribeResponse, TranscribeRequest>('/api/transcribe', { body: req });
}

/** Upload narration audio for a generation run; returns its server path + duration. */
export async function uploadAudio(file: File): Promise<UploadAudioResponse> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/audio/upload', { method: 'POST', body: form });
  const json = (await res.json()) as UploadAudioResponse | { error: string };
  if (!res.ok) throw new Error('error' in json ? json.error : `upload failed (${res.status})`);
  return json as UploadAudioResponse;
}
