/** Client for project save/load. Server side is stubbed (501) for now. */

import type {
  DeleteProjectResponse,
  ListProjectsResponse,
  LoadProjectResponse,
  SaveProjectRequest,
  SaveProjectResponse,
} from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';

/** Permanently delete a saved project (its JSON file on the server). */
export function deleteProject(id: string): Promise<DeleteProjectResponse> {
  return fetchJson<DeleteProjectResponse>(`/api/project/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Saved projects, newest first — feeds Home's "Recent Generations". */
export function listProjects(): Promise<ListProjectsResponse> {
  return fetchJson<ListProjectsResponse>('/api/projects');
}

export function saveProject(req: SaveProjectRequest): Promise<SaveProjectResponse> {
  return fetchJson<SaveProjectResponse, SaveProjectRequest>('/api/project', { body: req });
}

export function loadProject(id: string): Promise<LoadProjectResponse> {
  return fetchJson<LoadProjectResponse>(`/api/project/${encodeURIComponent(id)}`);
}
