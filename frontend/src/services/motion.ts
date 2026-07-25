/** Client for on-demand motion-graphic rendering (editor replace path). */

import type { MotionRenderRequest, MotionRenderResponse } from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';

export function renderMotion(req: MotionRenderRequest): Promise<MotionRenderResponse> {
  return fetchJson<MotionRenderResponse, MotionRenderRequest>('/api/motion/render', { body: req });
}
