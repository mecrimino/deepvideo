/**
 * The agent LLM seam. v1 talks to Ollama's OpenAI-compatible endpoint; a
 * Claude-backed client can replace it later by implementing LLMClient.
 * Callers depend ONLY on the LLMClient interface.
 */

import { OLLAMA_MODEL, OLLAMA_URL } from './config.js';

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
  /** Abort the request after this many ms (default 30s). */
  timeoutMs?: number;
}

/** The swappable LLM interface (Ollama now, Claude later). */
export interface LLMClient {
  readonly model: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatMessage>;
}

/* ----------------------- OpenAI wire format mapping ----------------------- */

interface WireToolCall {
  id?: string;
  function: { name: string; arguments: string };
}

interface WireMessage {
  role: string;
  content: string | null;
  tool_calls?: WireToolCall[];
  tool_call_id?: string;
}

function toWire(m: ChatMessage): WireMessage {
  const wire: WireMessage = { role: m.role, content: m.content };
  if (m.toolCalls?.length) {
    wire.tool_calls = m.toolCalls.map((t) => ({
      id: t.id,
      function: { name: t.name, arguments: t.arguments },
    }));
  }
  if (m.toolCallId) wire.tool_call_id = m.toolCallId;
  return wire;
}

/**
 * Ollama client speaking the OpenAI-compatible /chat/completions protocol
 * with plain fetch — no SDK needed.
 */
export class OllamaClient implements LLMClient {
  readonly model: string;
  readonly baseUrl: string;

  constructor(model: string = OLLAMA_MODEL, baseUrl: string = OLLAMA_URL) {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  /** True when the Ollama endpoint answers (callers fall back to heuristics). */
  async isAvailable(timeoutMs = 1500): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatMessage> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toWire),
      stream: false,
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.json) body.response_format = { type: 'json_object' };
    if (options?.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 30_000),
    });
    if (!res.ok) {
      throw new Error(`Ollama chat failed: ${res.status} ${await res.text().catch(() => '')}`);
    }

    const data = (await res.json()) as { choices?: { message?: WireMessage }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Ollama chat returned no choices');

    const out: ChatMessage = { role: 'assistant', content: msg.content ?? '' };
    if (msg.tool_calls?.length) {
      out.toolCalls = msg.tool_calls.map((t, i) => ({
        id: t.id ?? `call_${i}`,
        name: t.function.name,
        arguments: t.function.arguments,
      }));
    }
    return out;
  }
}

/**
 * Runs a tool-calling loop: send messages, execute any requested tools via
 * `handlers`, feed results back, repeat until the model answers with text.
 */
export async function runToolLoop(
  client: LLMClient,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  handlers: Record<string, (args: unknown) => Promise<unknown>>,
  maxRounds = 8,
): Promise<ChatMessage> {
  const history = [...messages];
  for (let round = 0; round < maxRounds; round++) {
    const reply = await client.chat(history, { tools });
    history.push(reply);
    if (!reply.toolCalls?.length) return reply;

    for (const call of reply.toolCalls) {
      const handler = handlers[call.name];
      let result: unknown;
      if (!handler) {
        result = { error: `unknown tool: ${call.name}` };
      } else {
        try {
          let args: unknown = {};
          try {
            args = call.arguments ? JSON.parse(call.arguments) : {};
          } catch {
            args = { raw: call.arguments };
          }
          result = await handler(args);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      history.push({
        role: 'tool',
        content: JSON.stringify(result ?? null),
        toolCallId: call.id,
      });
    }
  }
  return history[history.length - 1];
}

/**
 * Ask the LLM for a JSON payload; returns null on ANY failure (model offline,
 * malformed output, timeout) so callers can fall back to heuristics.
 */
export async function tryLlmJson<T>(
  llm: LLMClient,
  system: string,
  user: string,
  validate: (parsed: unknown) => T | null,
  timeoutMs = 20_000,
): Promise<T | null> {
  try {
    const reply = await llm.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.2, timeoutMs },
    );
    const text = reply.content.trim().replace(/^```(?:json)?\s*|```$/g, '');
    return validate(JSON.parse(text));
  } catch {
    return null;
  }
}
