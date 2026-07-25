/**
 * Motion graphics route — render a text animation / motion graphic on demand
 * (editor "Replace with motion graphic"). Proxies to the core, which builds the
 * spec and renders it with Remotion; the returned asset is timeline-ready.
 */

import type { FastifyInstance } from 'fastify';
import type { MotionRenderRequest, MotionRenderResponse } from '@deep-vision/shared';
import { CoreDownError, core } from '../coreClient.ts';

export function motionRoutes(app: FastifyInstance): void {
  app.post<{ Body: MotionRenderRequest }>('/api/motion/render', async (req, reply) => {
    try {
      return await core.post<MotionRenderResponse>('/motion/render', req.body ?? {});
    } catch (err) {
      if (err instanceof CoreDownError) {
        return reply.code(503).send({ error: err.message, coreDown: true });
      }
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
