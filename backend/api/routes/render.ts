/**
 * Render routes (Ch7 Layer 5 rendering) — proxy to the core exporter.
 *   POST /api/render        → start a render job from a Timeline
 *   GET  /api/render/:id    → poll job; when done, expose the output URL
 *
 * The heavy ffmpeg compositing lives in the Python core (Exporter agent); the
 * gateway serves the finished file statically from /files.
 */

import type { FastifyInstance } from 'fastify';
import type { RenderJob, RenderRequest } from '@deep-vision/shared';
import { CoreDownError, core } from '../coreClient.ts';

function fail(reply: import('fastify').FastifyReply, err: unknown) {
  if (err instanceof CoreDownError) return reply.code(503).send({ error: err.message, coreDown: true });
  return reply.code(502).send({ error: (err as Error).message });
}

/** Rewrite a repo-relative output path into a URL the browser can load. */
function withUrl(job: RenderJob): RenderJob {
  if (job.outputPath && !job.url) {
    return { ...job, url: `/files/${job.outputPath.replace(/^\/+/, '')}` };
  }
  return job;
}

export function renderRoutes(app: FastifyInstance): void {
  app.post<{ Body: RenderRequest }>('/api/render', async (req, reply) => {
    if (!req.body?.timeline) return reply.code(400).send({ error: 'timeline required' });
    try {
      const { job } = await core.post<{ job: RenderJob }>('/render', req.body);
      return { job: withUrl(job) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>('/api/render/:id', async (req, reply) => {
    try {
      const { job } = await core.get<{ job: RenderJob }>(`/render/${encodeURIComponent(req.params.id)}`);
      return { job: withUrl(job) };
    } catch (err) {
      return fail(reply, err);
    }
  });
}
