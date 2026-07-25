/**
 * Voice routes — narration voices from the local Kokoro TTS (via the core).
 *   GET /api/voices              → list available voices (+ availability)
 *   GET /api/voice/preview/:voice → stream a short WAV sample for the picker
 *
 * The picker calls these BEFORE a generation so the user can choose and audition
 * a voice. Synthesis itself happens inside the pipeline run (core).
 */

import type { FastifyInstance } from 'fastify';
import type { VoicesResponse } from '@deep-vision/shared';
import { config } from '../../config/index.ts';
import { CoreDownError, core } from '../coreClient.ts';

export function voiceRoutes(app: FastifyInstance): void {
  app.get('/api/voices', async (_req, reply) => {
    try {
      return await core.get<VoicesResponse>('/voices');
    } catch (err) {
      if (err instanceof CoreDownError) {
        return reply.code(503).send({ error: err.message, coreDown: true });
      }
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  // Binary passthrough (coreClient is JSON-only, so fetch the core directly).
  app.get<{ Params: { voice: string } }>('/api/voice/preview/:voice', async (req, reply) => {
    const url = `${config.coreUrl}/voice/preview/${encodeURIComponent(req.params.voice)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      return reply.code(503).send({ error: `core unreachable: ${(err as Error).message}` });
    }
    if (!res.ok) {
      return reply.code(res.status).send({ error: `preview failed (${res.status})` });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return reply
      .header('Content-Type', res.headers.get('content-type') ?? 'audio/wav')
      .header('Cache-Control', 'public, max-age=86400')
      .send(buf);
  });
}
