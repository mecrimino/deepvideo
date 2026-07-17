/**
 * Fastify entry — the local API the React editor talks to.
 *
 * Everything is real and local: uploads land under DATA_DIR/media and are
 * probed/thumbnailed with ffmpeg, the clip catalog is searched with the local
 * embedder, the agent pipeline runs in-process (Ollama when available,
 * deterministic heuristics otherwise), renders encode with ffmpeg into
 * DATA_DIR/exports, and projects persist as JSON. The one remaining stub is
 * whisper transcription (needs the nodejs-whisper native build) — it still
 * returns 501 so the frontend can say so honestly.
 */

import './env.js'; // load .env FIRST — later imports read process.env at module load

import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import type {
  AgentChatRequest,
  AgentChatResponse,
  ApiError,
  CancelRunResponse,
  DeleteProjectResponse,
  HealthResponse,
  IndexClipsRequest,
  IndexClipsResponse,
  ListClipsResponse,
  ListProjectsResponse,
  LoadProjectResponse,
  PipelineRun,
  RenderJob,
  RenderRequest,
  RunPipelineRequest,
  RunPipelineResponse,
  SaveProjectRequest,
  SaveProjectResponse,
  SearchClipsRequest,
  SearchClipsResponse,
  StartRenderResponse,
  StockImportRequest,
  StockImportResponse,
  StockResult,
  StockSearchRequest,
  StockSearchResponse,
  TranscribeRequest,
  UploadAudioResponse,
  UploadMediaResponse,
} from '@deep-video/shared';
import type { ClipAsset } from '@deep-video/shared';
import { OllamaClient, runPipeline, uid } from '@deep-video/model';
import { agentChat } from './agent.js';
import { createClipEmbedder } from './clip.js';
import { openDb } from './db.js';
import { createGroqMiniLLM, createOpenRouterMiniLLM } from './mini/llm.js';
import { runMiniPipeline } from './mini/run.js';
import { createStockSearch } from './mini/stock.js';
import { createUsageStore } from './mini/usage.js';
import { createClipVision } from './mini/vision.js';
import { indexDirectory, isAudioFile, isMediaFile, registerMediaFile, saveUpload } from './library.js';
import { DATA_DIR, MEDIA_DIR, ensureDataDirs, fromDataRelative, toDataRelative } from './paths.js';
import { deleteProject, listProjects, loadProject, saveProject } from './projects.js';
import { ffmpegAvailable, probe, renderTimeline } from './render.js';
import { createRunStore } from './runstore.js';
import { transcribeAudio } from './transcribe.js';

const PORT = Number(process.env.PORT ?? 8787);

ensureDataDirs();
const app = Fastify({ logger: true });
await app.register(fastifyMultipart, {
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB per file
});
await app.register(fastifyStatic, {
  root: DATA_DIR,
  prefix: '/files/',
  decorateReply: true,
});

const db = await openDb(path.join(DATA_DIR, 'deepvideo.db'));
const embedder = await createClipEmbedder();
const runStore = createRunStore();
const ollama = new OllamaClient();

/** Deep Video v1 Mini backends (keys from .env — see api.md). CLIP is lazy. */
const miniDeps = {
  db,
  libraryEmbedder: embedder,
  runStore,
  nicheLLM: createGroqMiniLLM(),
  keywordLLM: createOpenRouterMiniLLM(),
  stock: createStockSearch(),
  vision: createClipVision(),
  usage: createUsageStore(),
};

/** In-memory registries for things that are actively in flight. */
const liveRuns = new Map<string, PipelineRun>();
const renderJobs = new Map<string, RenderJob>();
/** Run ids the user cancelled — the mini pipeline checks this cooperatively. */
const cancelledRuns = new Set<string>();

function errorPayload(err: unknown): ApiError {
  return { error: err instanceof Error ? err.message : String(err) };
}

function notImplemented(what: string): ApiError {
  return { error: `${what} is not implemented yet`, notImplemented: true };
}

/* --------------------------------- health -------------------------------- */

app.get('/api/health', async (): Promise<HealthResponse> => {
  return {
    ok: true,
    version: '0.1.0',
    ffmpeg: await ffmpegAvailable(),
    ollama: await ollama.isAvailable(),
    whisper: true, // local whisper via transformers.js (weights fetch on first use)
  };
});

/* ------------------------------- transcribe ------------------------------ */

app.post<{ Body: TranscribeRequest }>('/api/transcribe', async (req, reply) => {
  if (!req.body?.audioPath) {
    return reply.code(400).send({ error: 'audioPath is required' } satisfies ApiError);
  }
  try {
    const transcript = await transcribeAudio(fromDataRelative(req.body.audioPath), {
      language: req.body.language,
    });
    return { transcript };
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send(errorPayload(err));
  }
});

/** Upload narration audio for a generation run (kept out of the clip library). */
app.post('/api/audio/upload', async (req, reply) => {
  const file = await req.file();
  if (!file) return reply.code(400).send({ error: 'no file in request' } satisfies ApiError);
  if (!isAudioFile(file.filename) && !isMediaFile(file.filename)) {
    return reply.code(400).send({ error: `unsupported audio type: ${file.filename}` } satisfies ApiError);
  }
  try {
    const dest = await saveUpload(file.filename, await file.toBuffer());
    const info = await probe(dest);
    return {
      path: toDataRelative(dest),
      durationSec: info.durationSec,
      name: file.filename,
    } satisfies UploadAudioResponse;
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send(errorPayload(err));
  }
});

/* ---------------------------------- media -------------------------------- */

app.post('/api/media/upload', async (req, reply) => {
  const file = await req.file();
  if (!file) return reply.code(400).send({ error: 'no file in request' } satisfies ApiError);
  if (!isMediaFile(file.filename)) {
    return reply.code(400).send({ error: `unsupported file type: ${file.filename}` } satisfies ApiError);
  }
  try {
    const buf = await file.toBuffer();
    const dest = await saveUpload(file.filename, buf);
    const asset = await registerMediaFile(dest, db, embedder, { source: 'user' });
    return { asset } satisfies UploadMediaResponse;
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send(errorPayload(err));
  }
});

/* ------------------------------ stock footage ---------------------------- */

app.post<{ Body: StockSearchRequest }>('/api/stock/search', async (req, reply) => {
  const query = req.body?.query?.trim();
  if (!query) return reply.code(400).send({ error: 'query is required' } satisfies ApiError);
  try {
    const candidates = await miniDeps.stock.search(query, req.body?.perSource ?? 8);
    const results: StockResult[] = candidates.map((c) => ({
      id: c.id,
      source: c.source,
      thumbUrl: c.thumbUrl,
      videoUrl: c.videoUrl,
      width: c.width,
      height: c.height,
      durationSec: c.durationSec,
    }));
    return { query, results } satisfies StockSearchResponse;
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send(errorPayload(err));
  }
});

app.post<{ Body: StockImportRequest }>('/api/stock/import', async (req, reply) => {
  const result = req.body?.result;
  if (!result?.videoUrl) return reply.code(400).send({ error: 'result.videoUrl is required' } satisfies ApiError);
  try {
    const res = await fetch(result.videoUrl, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = await saveUpload(`${(req.body.tags ?? ['stock']).slice(0, 5).join('_')}_${result.id}.mp4`, buf);
    const asset = await registerMediaFile(dest, db, embedder, {
      source: 'stock',
      tags: req.body.tags,
      license: result.source === 'pexels' ? 'Pexels' : 'Pixabay',
    });
    return { asset } satisfies StockImportResponse;
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send(errorPayload(err));
  }
});

/* ---------------------------------- clips -------------------------------- */

app.post<{ Body: IndexClipsRequest }>('/api/clips/index', async (req, reply) => {
  try {
    const dir = req.body?.dir ? fromDataRelative(req.body.dir) : MEDIA_DIR;
    const { indexed, skipped } = await indexDirectory(dir, db, embedder, req.body?.source ?? 'user');
    return { indexed: indexed.length, skipped, assets: indexed } satisfies IndexClipsResponse;
  } catch (err) {
    return reply.code(500).send(errorPayload(err));
  }
});

app.post<{ Body: SearchClipsRequest }>('/api/clips/search', async (req, reply) => {
  if (!req.body?.query) return reply.code(400).send({ error: 'query is required' } satisfies ApiError);
  try {
    const vec = await embedder.embedText(req.body.query);
    const candidates = await db.search(vec, req.body.topK ?? 12);
    const assets: Record<string, ClipAsset> = {};
    for (const a of await db.getAssets(candidates.map((c) => c.clipId))) assets[a.id] = a;
    return { candidates, assets } satisfies SearchClipsResponse;
  } catch (err) {
    return reply.code(500).send(errorPayload(err));
  }
});

app.get('/api/clips', async (): Promise<ListClipsResponse> => {
  return { assets: await db.listAssets() };
});

/* -------------------------------- pipeline ------------------------------- */

app.post<{ Body: RunPipelineRequest }>('/api/pipeline/run', async (req, reply) => {
  const script = req.body?.script?.trim();
  const audioPath = req.body?.audioPath?.trim();
  if (!script && !audioPath) {
    return reply.code(400).send({ error: 'script or audioPath is required' } satisfies ApiError);
  }

  // Narration audio: transcription runs lazily inside the run's 'segment'
  // stage so the client can poll progress while whisper works.
  const getTranscript = audioPath
    ? () => transcribeAudio(fromDataRelative(audioPath))
    : undefined;

  // Kick the pipeline off and answer immediately; the client polls the run id.
  // Both engines report their initial state synchronously, so the run is in
  // liveRuns by the time the call returns.
  const before = new Set(liveRuns.keys());
  const runIdBox = { id: '' };
  const runPromise =
    req.body?.model === 'mini'
      ? runMiniPipeline(miniDeps, {
          script,
          audioPath,
          getTranscript,
          shouldStop: () => runIdBox.id !== '' && cancelledRuns.has(runIdBox.id),
          onProgress: (run) => {
            runIdBox.id = run.id;
            liveRuns.set(run.id, run);
          },
        })
      : (async () =>
          runPipeline(
            { llm: ollama, embedder, index: db, runStore },
            {
              script,
              transcript: getTranscript ? await getTranscript() : undefined,
              settings: req.body?.settings,
              onProgress: (run) => liveRuns.set(run.id, run),
            },
          ))();
  runPromise.then((run) => liveRuns.set(run.id, run)).catch((err) => app.log.error(err));

  let first: PipelineRun | undefined;
  for (const [id, run] of liveRuns) if (!before.has(id)) first = run;
  if (!first) first = await runPromise; // defensive: should not happen

  return { run: first } satisfies RunPipelineResponse;
});

app.get<{ Params: { id: string } }>('/api/pipeline/run/:id', async (req, reply) => {
  const live = liveRuns.get(req.params.id);
  if (live) return live;
  const stored = await runStore.load(req.params.id);
  if (stored) return stored;
  return reply.code(404).send({ error: `run not found: ${req.params.id}` } satisfies ApiError);
});

/** Cancel an in-flight run (the mini pipeline stops at its next checkpoint). */
app.post<{ Params: { id: string } }>('/api/pipeline/run/:id/cancel', async (req): Promise<CancelRunResponse> => {
  cancelledRuns.add(req.params.id);
  const live = liveRuns.get(req.params.id);
  if (live && live.status === 'running') {
    live.status = 'failed';
    const running = live.stages.find((s) => s.status === 'running');
    if (running) {
      running.status = 'failed';
      running.error = 'Cancelled by user';
    }
  }
  return { ok: true };
});

/* --------------------------------- render -------------------------------- */

app.post<{ Body: RenderRequest }>('/api/render', async (req, reply) => {
  if (!req.body?.timeline) {
    return reply.code(400).send({ error: 'timeline is required' } satisfies ApiError);
  }
  const job: RenderJob = { id: uid('render'), status: 'running', progress: 0 };
  renderJobs.set(job.id, job);

  // Apply the export options: resolution override and captions on/off.
  const timeline = structuredClone(req.body.timeline);
  if (req.body.width && req.body.height) {
    timeline.width = Math.round(req.body.width);
    timeline.height = Math.round(req.body.height);
  }
  if (req.body.burnCaptions === false) timeline.captions = [];

  const assets = new Map((await db.listAssets()).map((a) => [a.id, a.path]));
  renderTimeline(timeline, {
    format: req.body.format,
    resolveAsset: (id) => assets.get(id),
    onProgress: ({ progress, message }) => {
      job.progress = progress;
      job.message = message;
    },
  })
    .then((res) => {
      job.status = 'done';
      job.progress = 1;
      job.outputPath = res.outputPath;
      job.url = `/files/${res.outputPath}`;
      job.durationSec = res.durationSec;
    })
    .catch((err) => {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      app.log.error(err);
    });

  return { job } satisfies StartRenderResponse;
});

app.get<{ Params: { id: string } }>('/api/render/:id', async (req, reply) => {
  const job = renderJobs.get(req.params.id);
  if (!job) return reply.code(404).send({ error: `render job not found: ${req.params.id}` } satisfies ApiError);
  return { job } satisfies StartRenderResponse;
});

/* ------------------------------- agent chat ------------------------------- */

app.post<{ Body: AgentChatRequest }>('/api/agent/chat', async (req, reply) => {
  if (!req.body?.message || !req.body?.timeline) {
    return reply.code(400).send({ error: 'message and timeline are required' } satisfies ApiError);
  }
  try {
    const result = await agentChat({
      message: req.body.message,
      timeline: req.body.timeline,
      db,
      embedder,
      ollama,
      mentions: req.body.mentions,
      effort: req.body.effort,
    });
    const changed = result.actions.length > 0;
    return {
      reply: result.reply,
      timeline: changed ? result.timeline : undefined,
      actions: result.actions,
      backend: result.backend,
    } satisfies AgentChatResponse;
  } catch (err) {
    return reply.code(500).send(errorPayload(err));
  }
});

/* --------------------------------- project ------------------------------- */

app.post<{ Body: SaveProjectRequest }>('/api/project', async (req, reply) => {
  if (!req.body?.project?.id) {
    return reply.code(400).send({ error: 'project with an id is required' } satisfies ApiError);
  }
  const savedAt = await saveProject(req.body.project);
  return { id: req.body.project.id, savedAt } satisfies SaveProjectResponse;
});

app.get('/api/projects', async (): Promise<ListProjectsResponse> => {
  const entries = await listProjects();
  const ids = entries.map((e) => e.firstAssetId).filter((id): id is string => !!id);
  const thumbs = new Map(
    (await db.getAssets(ids)).map((a) => [a.id, a.thumbPath]),
  );
  return {
    projects: entries.map(({ firstAssetId, ...summary }) => ({
      ...summary,
      thumb: firstAssetId ? thumbs.get(firstAssetId) : undefined,
    })),
  };
});

app.get<{ Params: { id: string } }>('/api/project/:id', async (req, reply) => {
  const project = await loadProject(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: `project not found: ${req.params.id}` } satisfies ApiError);
  }
  return { project } satisfies LoadProjectResponse;
});

app.delete<{ Params: { id: string } }>('/api/project/:id', async (req): Promise<DeleteProjectResponse> => {
  return { ok: await deleteProject(req.params.id) };
});

/* ---------------------------------- boot --------------------------------- */

app
  .listen({ port: PORT, host: '127.0.0.1' })
  .then(() => app.log.info(`Deep Video server on http://localhost:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
