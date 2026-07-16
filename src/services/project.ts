/** Client for project save/load. Server side is stubbed (501) for now. */

import type { LoadProjectResponse, SaveProjectRequest, SaveProjectResponse } from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function saveProject(req: SaveProjectRequest): Promise<SaveProjectResponse> {
  return fetchJson<SaveProjectResponse, SaveProjectRequest>('/api/project', { body: req });
}

export function loadProject(id: string): Promise<LoadProjectResponse> {
  return fetchJson<LoadProjectResponse>(`/api/project/${encodeURIComponent(id)}`);
}
