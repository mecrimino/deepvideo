/**
 * Pipeline routes — proxy the run lifecycle to the Python core (Ch19).
 *   POST /api/pipeline/run            → start a run
 *   GET  /api/pipeline/run/:id        → poll run state (frontend monitor)
 *   POST /api/pipeline/run/:id/cancel → cancel
 */

import type { FastifyInstance } from 'fastify';
import type {
  CancelRunResponse,
  DirectorPlanRequest,
  DirectorPlanResponse,
  ListRunsResponse,
  PipelineRun,
  RunPipelineRequest,
  RunPipelineResponse,
} from '@deep-vision/shared';
import { CoreDownError, core } from '../coreClient.ts';

export function pipelineRoutes(app: FastifyInstance): void {
  // Pre-production planning chat with the Director (talk it through, then generate).
  app.post<{ Body: DirectorPlanRequest }>('/api/director/plan', async (req, reply) => {
    const body = req.body ?? { messages: [] };
    if (!body.messages?.length) {
      return reply.code(400).send({ error: 'provide at least one message' });
    }
    try {
      return await core.post<DirectorPlanResponse>('/director/plan', {
        messages: body.messages,
        model: body.model ?? 'pro',
      });
    } catch (err) {
      return replyForCore(reply, err);
    }
  });

  app.post<{ Body: RunPipelineRequest }>('/api/pipeline/run', async (req, reply) => {
    const body = req.body ?? {};
    if (!body.script && !body.audioPath) {
      return reply.code(400).send({ error: 'provide a script or audioPath' });
    }
    try {
      return await core.post<RunPipelineResponse>('/pipeline/run', {
        script: body.script,
        audioPath: body.audioPath,
        model: body.model ?? 'mini',
        voice: body.voice,
        niche: body.niche,
        settings: body.settings,
        skipExpand: body.skipExpand ?? false,
      });
    } catch (err) {
      return replyForCore(reply, err);
    }
  });

  app.get('/api/pipeline/runs', async (_req, reply) => {
    try {
      return await core.get<ListRunsResponse>('/pipeline/runs');
    } catch (err) {
      return replyForCore(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>('/api/pipeline/run/:id', async (req, reply) => {
    try {
      return await core.get<PipelineRun>(`/pipeline/run/${encodeURIComponent(req.params.id)}`);
    } catch (err) {
      return replyForCore(reply, err);
    }
  });

  // Fill beats that got no footage in a finished run (resume, don't redo).
  app.post<{ Params: { id: string } }>('/api/pipeline/run/:id/fill', async (req, reply) => {
    try {
      return await core.post<RunPipelineResponse>(
        `/pipeline/run/${encodeURIComponent(req.params.id)}/fill`,
      );
    } catch (err) {
      return replyForCore(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/pipeline/run/:id/cancel', async (req, reply) => {
    try {
      return await core.post<CancelRunResponse>(
        `/pipeline/run/${encodeURIComponent(req.params.id)}/cancel`,
      );
    } catch (err) {
      return replyForCore(reply, err);
    }
  });
}

function replyForCore(reply: import('fastify').FastifyReply, err: unknown) {
  if (err instanceof CoreDownError) {
    return reply.code(503).send({ error: err.message, coreDown: true });
  }
  return reply.code(502).send({ error: (err as Error).message });
}
