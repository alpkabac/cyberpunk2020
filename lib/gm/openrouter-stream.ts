/**
 * OpenRouter chat completions with SSE streaming (token deltas).
 */

import type { OpenRouterChatMessage, OpenRouterToolCall } from './context-builder';
import { GM_TOOL_DEFINITIONS } from './tool-definitions';
/** Mirrors {@link OpenRouterCompletionResult} — kept local to avoid circular imports. */
interface StreamedCompletionResult {
  content: string | null;
  raw: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableOpenRouterFailure(message: string): boolean {
  if (/OpenRouter error (\d+)/.test(message)) {
    const m = /OpenRouter error (\d+)/.exec(message);
    const status = m ? parseInt(m[1]!, 10) : 0;
    return status === 429 || status === 502 || status === 503 || status === 504;
  }
  return /fetch|network|ECONNRESET|ETIMEDOUT|Failed to fetch|ECONNREFUSED/i.test(message);
}

function formatOpenRouterErrorBody(parsed: unknown, fallbackText: string): string {
  if (!parsed || typeof parsed !== 'object') return fallbackText;
  const o = parsed as Record<string, unknown>;
  if (o.error && typeof o.error === 'object') {
    return JSON.stringify(o.error);
  }
  if (typeof o.message === 'string') {
    return JSON.stringify({ message: o.message, code: o.code });
  }
  return fallbackText;
}

type ToolCallAcc = { id: string; name: string; arguments: string };

function mergeToolCallDelta(acc: Map<number, ToolCallAcc>, tc: Record<string, unknown>): void {
  const idx = typeof tc.index === 'number' ? tc.index : 0;
  let slot = acc.get(idx);
  if (!slot) {
    slot = { id: '', name: '', arguments: '' };
    acc.set(idx, slot);
  }
  if (typeof tc.id === 'string' && tc.id.length > 0) slot.id = tc.id;
  const fn = tc.function as Record<string, unknown> | undefined;
  if (fn) {
    if (typeof fn.name === 'string' && fn.name.length > 0) slot.name = fn.name;
    if (typeof fn.arguments === 'string') slot.arguments += fn.arguments;
  }
}

function accToOpenRouterToolCalls(acc: Map<number, ToolCallAcc>): OpenRouterToolCall[] {
  const entries = [...acc.entries()].sort((a, b) => a[0] - b[0]);
  return entries.map(([i, t], ord) => ({
    id: t.id && t.id.length > 0 ? t.id : `stream_call_${ord}_${i}`,
    type: 'function',
    function: {
      name: t.name,
      arguments: t.arguments && t.arguments.length > 0 ? t.arguments : '{}',
    },
  }));
}

function buildSyntheticRaw(content: string | null, toolCalls: OpenRouterToolCall[] | null): unknown {
  const message: Record<string, unknown> = {};
  if (content != null && content.length > 0) message.content = content;
  if (toolCalls && toolCalls.length > 0) message.tool_calls = toolCalls;
  return { choices: [{ message }] };
}

/**
 * Single streaming completion; invokes `onContentDelta` for each text delta as it arrives.
 */
export async function callOpenRouterChatStreamOnce(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  tools?: boolean;
  reasoning?: { effort: 'high' };
  onContentDelta?: (text: string) => void;
}): Promise<StreamedCompletionResult> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    temperature: 0.7,
    stream: true,
  };

  if (params.reasoning) {
    body.reasoning = params.reasoning;
  }

  if (params.tools) {
    body.tools = GM_TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey}`,
    'Content-Type': 'application/json',
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  if (referer) {
    headers['HTTP-Referer'] = referer;
    headers['X-Title'] = process.env.OPENROUTER_APP_TITLE?.trim() || 'Cyberpunk 2020 AI GM';
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      raw = { parseError: text };
    }
    const detail = formatOpenRouterErrorBody(raw, text);
    if (res.status === 401) {
      throw new Error(
        `OpenRouter 401 (auth failed): ${detail}. ` +
          `Set CP2020_OPENROUTER_API_KEY in app/.env.local (see .env.local.example), restart dev server.`,
      );
    }
    throw new Error(`OpenRouter error ${res.status}: ${detail}`);
  }

  if (!res.body) {
    throw new Error('OpenRouter stream: empty response body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let fullContent = '';
  const toolAcc = new Map<number, ToolCallAcc>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5).trimStart();
        if (data === '[DONE]') continue;
        if (data.length === 0) continue;

        let json: unknown;
        try {
          json = JSON.parse(data) as unknown;
        } catch {
          continue;
        }

        const choices = (json as { choices?: unknown }).choices;
        if (!Array.isArray(choices) || choices.length === 0) continue;
        const choice = choices[0] as Record<string, unknown>;
        const delta = choice.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        const tcList = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (tcList) {
          for (const tc of tcList) {
            mergeToolCallDelta(toolAcc, tc);
          }
        }

        const piece = delta.content;
        if (typeof piece === 'string' && piece.length > 0) {
          fullContent += piece;
          params.onContentDelta?.(piece);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const toolCalls = accToOpenRouterToolCalls(toolAcc);
  const hasTools = toolAcc.size > 0;
  const raw = buildSyntheticRaw(fullContent.length > 0 ? fullContent : null, hasTools ? toolCalls : null);
  const content = fullContent.length > 0 ? fullContent : null;
  return { content, raw };
}

export async function callOpenRouterChatStream(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  tools?: boolean;
  reasoning?: { effort: 'high' };
  onContentDelta?: (text: string) => void;
  maxRetries?: number;
}): Promise<StreamedCompletionResult> {
  const maxAttempts = Math.max(1, params.maxRetries ?? 4);
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await callOpenRouterChatStreamOnce(params);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retriable = isRetriableOpenRouterFailure(msg);
      if (!retriable || attempt === maxAttempts - 1) {
        throw e;
      }
      await sleep(350 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}
