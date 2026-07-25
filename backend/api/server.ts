/**
 * Deep Vision — backend API gateway (Ch2 Layer 1/2 boundary, Ch3, Ch20).
 *
 * Fastify server on :8787. It is the single ``/api`` surface the frontend talks
 * to. Local concerns (uploads, projects, clip catalog, static media) are handled
 * here in Node; AI/agentic work (pipeline, transcription, stock search, agent
 * chat, render) is proxied to the Python core (FastAPI) via coreClient.
 *
 * Run:  npm run dev:backend      (tsx watch)
 *
 * fastify 4 → @fastify/multipart@8 + @fastify/static@7 (v9/v8 need fastify 5).
 */

import { mkdir } from 'node:fs/promises';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from '../config/index.ts';
import { aiProxyRoutes } from './routes/aiProxy.ts';
import { clipRoutes } from './routes/clips.ts';
import { editingLabRoutes } from './routes/editinglab.ts';
import { healthRoutes } from './routes/health.ts';
import { mediaRoutes } from './routes/media.ts';
import { pipelineRoutes } from './routes/pipeline.ts';
import { projectRoutes } from './routes/project.ts';
import { motionRoutes } from './routes/motion.ts';
import { renderRoutes } from './routes/render.ts';
import { settingsRoutes } from './routes/settings.ts';
import { voiceRoutes } from './routes/voices.ts';

async function main(): Promise<void> {
  // ensure runtime dirs exist so uploads/renders never fail on a fresh clone
  for (const dir of Object.values(config.paths)) {
    await mkdir(dir, { recursive: true }).catch(() => undefined);
  }

  const app = Fastify({
    logger: { transport: undefined, level: process.env.LOG_LEVEL || 'info' },
    bodyLimit: 50 * 1024 * 1024,
  });

  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024 } });

  // Serve generated/downloaded media so the editor preview can load clips by
  // their repo-relative path under /files/<path>.
  await app.register(fastifyStatic, {
    root: config.root,
    prefix: '/files/',
    decorateReply: false,
    index: false,
    list: false,
  });

  healthRoutes(app);
  pipelineRoutes(app);
  motionRoutes(app);
  voiceRoutes(app);
  aiProxyRoutes(app);
  clipRoutes(app);
  editingLabRoutes(app);
  mediaRoutes(app);
  projectRoutes(app);
  renderRoutes(app);
  settingsRoutes(app);

  app.get('/', async () => ({ service: 'deep-vision-backend', ok: true }));

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`gateway on http://${config.host}:${config.port} → core ${config.coreUrl}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
