/** Client for the Deep Video Agent chat endpoint (abortable via signal). */

import type { AgentChatRequest, AgentChatResponse, ApiError } from '@deep-video/shared';
import { ApiRequestError } from '../lib/fetchJson';

export async function agentChat(
  req: AgentChatRequest,
  signal?: AbortSignal,
): Promise<AgentChatResponse> {
  const res = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  const json = (await res.json()) as AgentChatResponse | ApiError;
  if (!res.ok) throw new ApiRequestError(res.status, json as ApiError);
  return json as AgentChatResponse;
}
