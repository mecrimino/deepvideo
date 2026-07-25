/** GET /api/health — combined gateway + core health (Ch1 UI health panel). */

import type { FastifyInstance } from 'fastify';
import { core } from '../coreClient.ts';

export function healthRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => {
    const coreHealth = (await core.health()) as Record<string, unknown>;
    return {
      ok: true,
      version: '0.1.0',
      core: coreHealth.ok === true,
      ffmpeg: coreHealth.ffmpeg ?? false,
      ollama: false,
      whisper: coreHealth.whisper ?? false,
      llm: coreHealth.llm ?? false,
      stock: coreHealth.stock ?? false,
    };
  });
}
