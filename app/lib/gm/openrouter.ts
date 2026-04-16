/**
 * OpenRouter chat completions + tool-call loop for the AI-GM.
 */

import type { OpenRouterChatMessage, OpenRouterToolCall } from './context-builder';
import { GM_TOOL_DEFINITIONS } from './tool-definitions';
import type { ToolExecutorContext, ToolExecutionResult } from './tool-executor';
import { executeGmToolCallFromModel } from './tool-executor';

export interface OpenRouterCompletionResult {
  /** Final assistant text (narration) */
  content: string | null;
  raw: unknown;
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

export async function callOpenRouterChat(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  tools?: boolean;
}): Promise<OpenRouterCompletionResult> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    temperature: 0.7,
  };

  if (params.tools) {
    body.tools = GM_TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  // Only Authorization + Content-Type by default. Optional Referer/Title can confuse some proxies;
  // set OPENROUTER_HTTP_REFERER (and optionally OPENROUTER_APP_TITLE) if you want OpenRouter usage attribution.
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

  const text = await res.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    raw = { parseError: text };
  }

  if (!res.ok) {
    const detail = formatOpenRouterErrorBody(raw, text);
    if (res.status === 401) {
      throw new Error(
        `OpenRouter 401 (auth failed): ${detail}. ` +
          `Set CP2020_OPENROUTER_API_KEY in app/.env.local (see .env.local.example), restart dev server. ` +
          `If you exposed the key, revoke it at openrouter.ai/keys and create a new one.`,
      );
    }
    throw new Error(`OpenRouter error ${res.status}: ${detail}`);
  }

  const content = extractAssistantContent(raw);
  return { content, raw };
}

function extractAssistantContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const msg = choices[0] as { message?: { content?: unknown; tool_calls?: unknown } };
  const c = msg.message?.content;
  if (typeof c === 'string') return c;
  return null;
}

export function extractToolCalls(data: unknown): OpenRouterToolCall[] {
  if (!data || typeof data !== 'object') return [];
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return [];
  const msg = choices[0] as { message?: { tool_calls?: OpenRouterToolCall[] } };
  const tc = msg.message?.tool_calls;
  return Array.isArray(tc) ? tc : [];
}

const MAX_TOOL_STEPS = 6;

/**
 * Runs chat completion in a loop until the model returns text or a step limit is hit.
 */
export async function runGmCompletionWithTools(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  toolContext: ToolExecutorContext;
  onToolResult?: (r: ToolExecutionResult) => void;
}): Promise<{ narration: string; lastRaw: unknown; toolLog: ToolExecutionResult[] }> {
  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: params.systemPrompt },
    { role: 'user', content: params.userContent },
  ];

  const toolLog: ToolExecutionResult[] = [];
  let lastRaw: unknown = null;

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const { content, raw } = await callOpenRouterChat({
      apiKey: params.apiKey,
      model: params.model,
      messages,
      tools: true,
    });
    lastRaw = raw;

    const toolCalls = extractToolCalls(raw);
    if (toolCalls.length === 0) {
      return { narration: content ?? '', lastRaw, toolLog };
    }

    const assistantMsg: OpenRouterChatMessage = {
      role: 'assistant',
      content: content ?? null,
      tool_calls: toolCalls,
    };
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      const name = tc.function?.name ?? '';
      const args = tc.function?.arguments ?? '{}';
      const exec = await executeGmToolCallFromModel(name, args, params.toolContext);
      toolLog.push(exec);
      params.onToolResult?.(exec);

      const payload = exec.ok
        ? { ok: true, result: exec.result }
        : { ok: false, error: exec.error };
      messages.push({
        role: 'tool',
        content: JSON.stringify(payload),
        tool_call_id: tc.id,
        name: tc.function?.name,
      });
    }
  }

  const { content, raw } = await callOpenRouterChat({
    apiKey: params.apiKey,
    model: params.model,
    messages,
    tools: false,
  });
  lastRaw = raw;
  return { narration: content ?? '', lastRaw, toolLog };
}
