/**
 * The agent LLM seam. v1 talks to Ollama's OpenAI-compatible endpoint; a
 * Claude-backed client can replace it later by implementing LLMClient.
 * Callers depend ONLY on the LLMClient interface.
 */

import { OLLAMA_MODEL, OLLAMA_URL } from './config.js';
import { NotImplementedError } from './types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant messages that call tools. */
  toolCalls?: ToolCall[];
  /** Present on role:'tool' messages (the tool result). */
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments. */
  arguments: string;
}

/** JSON-schema tool definition (OpenAI tool format, which Ollama accepts). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  temperature?: number;
  /** Force a JSON object response when the stage needs structured output. */
  json?: boolean;
}

/** The swappable LLM interface (Ollama now, Claude later). */
export interface LLMClient {
  readonly model: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatMessage>;
}

/**
 * Ollama client speaking the OpenAI-compatible /chat/completions protocol.
 * TODO: implement with plain fetch — no SDK needed.
 */
export class OllamaClient implements LLMClient {
  readonly model: string;
  readonly baseUrl: string;

  constructor(model: string = OLLAMA_MODEL, baseUrl: string = OLLAMA_URL) {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatMessage> {
    throw new NotImplementedError('model/llm.OllamaClient.chat');
  }
}

/**
 * Runs a tool-calling loop: send messages, execute any requested tools via
 * `handlers`, feed results back, repeat until the model answers with text.
 * TODO: implement once OllamaClient.chat works.
 */
export async function runToolLoop(
  _client: LLMClient,
  _messages: ChatMessage[],
  _tools: ToolDefinition[],
  _handlers: Record<string, (args: unknown) => Promise<unknown>>,
): Promise<ChatMessage> {
  throw new NotImplementedError('model/llm.runToolLoop');
}
