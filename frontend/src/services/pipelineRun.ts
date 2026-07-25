/**
 * UI side of the agent pipeline: start runs, poll stage progress, cancel.
 * Runs execute server-side and keep going regardless of which screen is open;
 * useAppStore owns the polling loop and the background-generation state.
 */

import type {
  CancelRunResponse,
  ListRunsResponse,
  PipelineRun,
  RunPipelineRequest,
  RunPipelineResponse,
} from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';

/** Kick off a pipeline run; returns immediately with the initial run state. */
export function startRun(req: RunPipelineRequest): Promise<RunPipelineResponse> {
  return fetchJson<RunPipelineResponse, RunPipelineRequest>('/api/pipeline/run', { body: req });
}

/** List all known runs — used to rediscover a processing run after reload. */
export function listRuns(): Promise<ListRunsResponse> {
  return fetchJson<ListRunsResponse>('/api/pipeline/runs');
}

/** Fetch the latest state of a run (polled while it works). */
export function getRun(id: string): Promise<PipelineRun> {
  return fetchJson<PipelineRun>(`/api/pipeline/run/${encodeURIComponent(id)}`);
}

/** Fill beats that got no footage in a finished run (resume, never redo). */
export function fillRun(id: string): Promise<RunPipelineResponse> {
  return fetchJson<RunPipelineResponse>(`/api/pipeline/run/${encodeURIComponent(id)}/fill`, {
    method: 'POST',
  });
}

/** Cancel an in-flight run; the pipeline stops at its next checkpoint. */
export function cancelRun(id: string): Promise<CancelRunResponse> {
  return fetchJson<CancelRunResponse>(`/api/pipeline/run/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}
