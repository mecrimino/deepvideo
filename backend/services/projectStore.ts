/**
 * Saved-project persistence (Ch7 project memory, disk-backed).
 * Each project is one JSON file under ``projects/<id>/project.json``.
 */

import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Project, ProjectSummary } from '@deep-vision/shared';
import { config } from '../config/index.ts';
import { removeClips } from './clipsStore.ts';
import { readJson, writeJson } from './jsonStore.ts';

/**
 * Media directories this app writes into, and therefore may delete from when a
 * project is removed. `assets/` ships with the repo (the sfx/font/background
 * library) and is never touched, however many projects reference it.
 */
const OWNED_DIRS = ['temp/upload/', 'temp/editinglab/', 'temp/render/', 'downloads/', 'cache/thumbnails/'];

/** Every library asset a project's timeline points at. */
function assetIds(project: Project | null): Set<string> {
  const ids = new Set<string>();
  for (const track of project?.timeline?.tracks ?? []) {
    for (const clip of track.clips) {
      if (clip.source.kind === 'asset') ids.add(clip.source.assetId);
    }
  }
  return ids;
}

function projectFile(id: string): string {
  return join(config.paths.projects, id, 'project.json');
}

export async function saveProject(project: Project): Promise<{ id: string; savedAt: string }> {
  const savedAt = new Date().toISOString();
  await writeJson(projectFile(project.id), { ...project, updatedAt: savedAt });
  return { id: project.id, savedAt };
}

export async function loadProject(id: string): Promise<Project | null> {
  return readJson<Project | null>(projectFile(id), null);
}

/**
 * Delete a project AND the media it owns: every asset its timeline referenced
 * that no other project still uses is dropped from the clip catalog and its
 * file (plus thumbnail) erased from disk. Shared and shipped media survive.
 */
export async function deleteProject(id: string): Promise<{ ok: boolean; clearedAssets: number }> {
  const doomed = assetIds(await loadProject(id));
  for (const other of await listProjects()) {
    if (other.id === id) continue;
    for (const used of assetIds(await loadProject(other.id))) doomed.delete(used);
  }

  const removed = await removeClips(doomed);
  for (const asset of removed) {
    for (const path of [asset.path, asset.thumbPath]) {
      if (!path || !OWNED_DIRS.some((dir) => path.startsWith(dir))) continue;
      await rm(join(config.root, path), { force: true }).catch(() => undefined);
    }
  }

  try {
    await rm(join(config.paths.projects, id), { recursive: true, force: true });
    return { ok: true, clearedAssets: removed.length };
  } catch {
    return { ok: false, clearedAssets: removed.length };
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  let ids: string[] = [];
  try {
    ids = (await readdir(config.paths.projects, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const summaries: ProjectSummary[] = [];
  for (const id of ids) {
    const p = await loadProject(id);
    if (!p) continue;
    summaries.push({
      id: p.id,
      title: p.title,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      durationSec: p.timeline?.durationSec,
    });
  }
  return summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
