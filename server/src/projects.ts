/**
 * Project persistence: JSON files under DATA_DIR/projects/<id>.json.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Project, ProjectSummary } from '@deep-video/shared';
import { PROJECTS_DIR } from './paths.js';

/** Listing entry: card summary + the asset id whose thumbnail represents it. */
export interface ProjectListEntry extends ProjectSummary {
  firstAssetId?: string;
}

function fileFor(id: string): string {
  return path.join(PROJECTS_DIR, `${id.replace(/[^\w-]/g, '_')}.json`);
}

export async function saveProject(project: Project): Promise<string> {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const savedAt = new Date().toISOString();
  const withStamp: Project = { ...project, updatedAt: savedAt };
  await fs.writeFile(fileFor(project.id), JSON.stringify(withStamp, null, 2), 'utf8');
  return savedAt;
}

export async function loadProject(id: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(fileFor(id), 'utf8');
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectListEntry[]> {
  let files: string[];
  try {
    files = await fs.readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const projects: ProjectListEntry[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(PROJECTS_DIR, f), 'utf8');
      const project = JSON.parse(raw) as Project;
      const videoTrack = project.timeline?.tracks?.find((t) => t.kind === 'video');
      const firstAssetClip = videoTrack?.clips.find((c) => c.source.kind === 'asset');
      projects.push({
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        durationSec: project.timeline?.durationSec,
        firstAssetId:
          firstAssetClip?.source.kind === 'asset' ? firstAssetClip.source.assetId : undefined,
      });
    } catch {
      // Ignore unreadable project files.
    }
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
