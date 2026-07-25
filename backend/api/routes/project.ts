/**
 * Project persistence routes (Ch7 project memory).
 *   POST   /api/project       → save
 *   GET    /api/project/:id   → load
 *   DELETE /api/project/:id   → delete
 *   GET    /api/projects      → list summaries
 */

import type { FastifyInstance } from 'fastify';
import type { SaveProjectRequest } from '@deep-vision/shared';
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
} from '../../services/projectStore.ts';

export function projectRoutes(app: FastifyInstance): void {
  app.get('/api/projects', async () => ({ projects: await listProjects() }));

  app.post<{ Body: SaveProjectRequest }>('/api/project', async (req, reply) => {
    const project = req.body?.project;
    if (!project?.id) return reply.code(400).send({ error: 'project.id required' });
    return saveProject(project);
  });

  app.get<{ Params: { id: string } }>('/api/project/:id', async (req, reply) => {
    const project = await loadProject(req.params.id);
    if (!project) return reply.code(404).send({ error: 'project not found' });
    return { project };
  });

  // Deletes the project's own media too (see projectStore.deleteProject).
  app.delete<{ Params: { id: string } }>('/api/project/:id', async (req) => {
    return deleteProject(req.params.id);
  });
}
