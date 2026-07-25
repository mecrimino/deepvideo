/** Client for the ffmpeg render endpoints (async job + polling). */

import type { RenderRequest, StartRenderResponse } from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';

export function startRender(req: RenderRequest): Promise<StartRenderResponse> {
  return fetchJson<StartRenderResponse, RenderRequest>('/api/render', { body: req });
}

export function getRenderJob(id: string): Promise<StartRenderResponse> {
  return fetchJson<StartRenderResponse>(`/api/render/${encodeURIComponent(id)}`);
}
