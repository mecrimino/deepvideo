/**
 * Fastify entry — the local API the React editor talks to.
 *
 * Routes are registered with real request/response types from
 * @deep-video/shared. Handlers that depend on unimplemented modules return
 * 501 + { notImplemented: true } so the frontend can detect stub endpoints.
 */

import Fastify from 'fastify';
import type {
  ApiError,
  HealthResponse,
  IndexClipsRequest,
  RenderRequest,
  RunPipelineRequest,
  SaveProjectRequest,
  SearchClipsRequest,
  TranscribeRequest,
} from '@deep-video/shared';

const PORT = Number(process.env.PORT ?? 8787);

const app = Fastify({ logger: true });

/** Uniform 501 payload for endpoints whose backing module is still a stub. */
function notImplemented(what: string): ApiError {
  return { error: `${what} is not implemented yet`, notImplemented: true };
}

/* --------------------------------- health -------------------------------- */

app.get('/api/health', async (): Promise<HealthResponse> => {
  // TODO: also report ffmpeg-on-PATH, Ollama reachability, whisper model presence.
  return { ok: true, version: '0.1.0' };
});

/* ------------------------------- transcribe ------------------------------ */

app.post<{ Body: TranscribeRequest }>('/api/transcribe', async (_req, reply) => {
  // TODO: call transcribe.transcribeAudio(req.body.audioPath)
  return reply.code(501).send(notImplemented('POST /api/transcribe (whisper.cpp)'));
});

/* ---------------------------------- clips -------------------------------- */

app.post<{ Body: IndexClipsRequest }>('/api/clips/index', async (_req, reply) => {
  // TODO: scan dir -> render.probe + render.extractFrames -> clip.embedImage -> db.upsertClip
  return reply.code(501).send(notImplemented('POST /api/clips/index (CLIP + sqlite-vec)'));
});

app.post<{ Body: SearchClipsRequest }>('/api/clips/search', async (_req, reply) => {
  // TODO: clip.embedText(req.body.query) -> db.search(embedding, topK)
  return reply.code(501).send(notImplemented('POST /api/clips/search (sqlite-vec kNN)'));
});

app.get('/api/clips', async (_req, reply) => {
  // TODO: db.listAssets()
  return reply.code(501).send(notImplemented('GET /api/clips'));
});

/* -------------------------------- pipeline ------------------------------- */

app.post<{ Body: RunPipelineRequest }>('/api/pipeline/run', async (_req, reply) => {
  // TODO: wire model.runPipeline with { llm: new OllamaClient(), embedder, index }
  //       and stream progress (SSE) as stages complete.
  return reply.code(501).send(notImplemented('POST /api/pipeline/run (agent pipeline)'));
});

app.get<{ Params: { id: string } }>('/api/pipeline/run/:id', async (_req, reply) => {
  // TODO: stage6_history.loadRun(req.params.id)
  return reply.code(501).send(notImplemented('GET /api/pipeline/run/:id'));
});

/* --------------------------------- render -------------------------------- */

app.post<{ Body: RenderRequest }>('/api/render', async (_req, reply) => {
  // TODO: render.renderTimeline(req.body.timeline) -> file under server/data/exports/
  return reply.code(501).send(notImplemented('POST /api/render (ffmpeg)'));
});

/* --------------------------------- project ------------------------------- */

app.post<{ Body: SaveProjectRequest }>('/api/project', async (_req, reply) => {
  // TODO: persist project JSON under DATA_DIR/projects/<id>.json
  return reply.code(501).send(notImplemented('POST /api/project'));
});

app.get<{ Params: { id: string } }>('/api/project/:id', async (_req, reply) => {
  // TODO: read DATA_DIR/projects/<id>.json
  return reply.code(501).send(notImplemented('GET /api/project/:id'));
});

/* ---------------------------------- boot --------------------------------- */

app
  .listen({ port: PORT, host: '127.0.0.1' })
  .then(() => app.log.info(`Deep Video server on http://localhost:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
