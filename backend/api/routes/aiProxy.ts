/**
 * Thin AI proxies to the Python core: transcription, stock search, agent chat.
 *   POST /api/transcribe   → core /transcribe
 *   POST /api/stock/search → core /stock/search  (normalised to StockResult)
 *   POST /api/agent/chat   → core /agent/chat
 */

import type { FastifyInstance } from 'fastify';
import type {
  AgentChatRequest,
  StockSearchRequest,
  TranscribeRequest,
} from '@deep-vision/shared';
import { CoreDownError, core } from '../coreClient.ts';

function fail(reply: import('fastify').FastifyReply, err: unknown) {
  if (err instanceof CoreDownError) return reply.code(503).send({ error: err.message, coreDown: true });
  return reply.code(502).send({ error: (err as Error).message });
}

export function aiProxyRoutes(app: FastifyInstance): void {
  app.post<{ Body: TranscribeRequest }>('/api/transcribe', async (req, reply) => {
    try {
      return await core.post('/transcribe', req.body);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Body: StockSearchRequest }>('/api/stock/search', async (req, reply) => {
    const { query, perSource } = req.body ?? { query: '' };
    if (!query) return reply.code(400).send({ error: 'query required' });
    try {
      return await core.post('/stock/search', { query, perSource: perSource ?? 8, kind: 'video' });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Body: AgentChatRequest }>('/api/agent/chat', async (req, reply) => {
    try {
      return await core.post('/agent/chat', req.body);
    } catch (err) {
      return fail(reply, err);
    }
  });
}
