/** Client for POST /api/render. Server side is stubbed (501) for now. */

import type { RenderRequest, RenderResponse } from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function renderTimeline(req: RenderRequest): Promise<RenderResponse> {
  return fetchJson<RenderResponse, RenderRequest>('/api/render', { body: req });
}
