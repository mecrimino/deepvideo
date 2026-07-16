/** Client for the Deep Video Agent chat endpoint. */

import type { AgentChatRequest, AgentChatResponse } from '@deep-video/shared';
import { fetchJson } from '../lib/fetchJson';

export function agentChat(req: AgentChatRequest): Promise<AgentChatResponse> {
  return fetchJson<AgentChatResponse, AgentChatRequest>('/api/agent/chat', { body: req });
}
