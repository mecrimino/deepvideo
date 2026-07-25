/**
 * Director planning chat — the pre-production conversation. The user and the
 * Director talk the video through (angle, length, style, hook, script) before
 * anything is generated; only when the plan is approved does the pipeline run.
 */

import type { DirectorPlanRequest, DirectorPlanResponse } from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';

/** Run one planning turn: send the transcript, get the Director's reply + plan. */
export function planConversation(req: DirectorPlanRequest): Promise<DirectorPlanResponse> {
  return fetchJson<DirectorPlanResponse, DirectorPlanRequest>('/api/director/plan', { body: req });
}
