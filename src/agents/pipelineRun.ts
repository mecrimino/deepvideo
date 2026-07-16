/**
 * UI side of the agent pipeline: start runs and stream stage progress.
 * The processing screen will consume this once POST /api/pipeline/run exists;
 * today it plays the design's fixed step list on a timer.
 */

import type { PipelineRun, RunPipelineRequest, RunPipelineResponse } from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

/** Kick off a pipeline run on the server (stubbed: throws ApiRequestError 501). */
export function startRun(req: RunPipelineRequest): Promise<RunPipelineResponse> {
  return fetchJson<RunPipelineResponse, RunPipelineRequest>('/api/pipeline/run', { body: req });
}

/** Fetch the latest state of a run (poll until SSE streaming is implemented). */
export function getRun(id: string): Promise<PipelineRun> {
  return fetchJson<PipelineRun>(`/api/pipeline/run/${encodeURIComponent(id)}`);
}
