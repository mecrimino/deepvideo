/**
 * Client-side persistence: project save/load + autosave via IndexedDB.
 * TODO(implement): open an IndexedDB database `deep-video` with a `projects`
 * store, debounce autosave from the editor store, list/load on Home.
 */

import type { Project } from '@deep-vision/shared';

export async function saveLocalProject(_project: Project): Promise<void> {
  throw new Error('TODO(src/services/projectStore.saveLocalProject): not implemented');
}

export async function loadLocalProject(_id: string): Promise<Project | undefined> {
  throw new Error('TODO(src/services/projectStore.loadLocalProject): not implemented');
}

export async function listLocalProjects(): Promise<Pick<Project, 'id' | 'title' | 'updatedAt'>[]> {
  throw new Error('TODO(src/services/projectStore.listLocalProjects): not implemented');
}
