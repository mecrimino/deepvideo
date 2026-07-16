/** Client for the clip-index endpoints. Server side is stubbed (501) for now. */

import type {
  ClipAsset,
  IndexClipsRequest,
  IndexClipsResponse,
  SearchClipsRequest,
  SearchClipsResponse,
} from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function indexClips(req: IndexClipsRequest): Promise<IndexClipsResponse> {
  return fetchJson<IndexClipsResponse, IndexClipsRequest>('/api/clips/index', { body: req });
}

export function searchClips(req: SearchClipsRequest): Promise<SearchClipsResponse> {
  return fetchJson<SearchClipsResponse, SearchClipsRequest>('/api/clips/search', { body: req });
}

export function listClips(): Promise<ClipAsset[]> {
  return fetchJson<ClipAsset[]>('/api/clips');
}
