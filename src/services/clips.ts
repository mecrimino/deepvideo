/** Client for the clip-library endpoints (upload, list, index, search). */

import type {
  IndexClipsRequest,
  IndexClipsResponse,
  ListClipsResponse,
  SearchClipsRequest,
  SearchClipsResponse,
  UploadMediaResponse,
} from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function indexClips(req: IndexClipsRequest): Promise<IndexClipsResponse> {
  return fetchJson<IndexClipsResponse, IndexClipsRequest>('/api/clips/index', { body: req });
}

export function searchClips(req: SearchClipsRequest): Promise<SearchClipsResponse> {
  return fetchJson<SearchClipsResponse, SearchClipsRequest>('/api/clips/search', { body: req });
}

export function listClips(): Promise<ListClipsResponse> {
  return fetchJson<ListClipsResponse>('/api/clips');
}

/** Upload one media file into the local library. */
export async function uploadMedia(file: File): Promise<UploadMediaResponse> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/media/upload', { method: 'POST', body: form });
  const json = (await res.json()) as UploadMediaResponse | { error: string };
  if (!res.ok) throw new Error('error' in json ? json.error : `upload failed (${res.status})`);
  return json as UploadMediaResponse;
}
