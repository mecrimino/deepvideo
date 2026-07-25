/**
 * User settings persistence — channels/brand, credits, and any future
 * client-side state that must survive a browser-data wipe. One JSON file on
 * disk (projects/settings.json); the frontend mirrors it in localStorage for
 * instant loads and pushes changes here fire-and-forget.
 */

import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config/index.ts';
import { readJson, writeJson } from '../../services/jsonStore.ts';

const FILE = join(config.paths.projects, 'settings.json');

export function settingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', async () => {
    return await readJson<Record<string, unknown>>(FILE, {});
  });

  app.put<{ Body: { key?: string; value?: unknown } }>('/api/settings', async (req, reply) => {
    const { key, value } = req.body ?? {};
    if (!key || typeof key !== 'string') {
      return reply.code(400).send({ error: 'provide a settings key' });
    }
    const all = await readJson<Record<string, unknown>>(FILE, {});
    all[key] = value;
    await writeJson(FILE, all);
    return { ok: true };
  });
}
