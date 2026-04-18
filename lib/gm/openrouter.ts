/**
 * OpenRouter chat completions + tool-call loop for the AI-GM.
 */

import type { OpenRouterChatMessage, OpenRouterToolCall } from './context-builder';
import { GM_TOOL_DEFINITIONS } from './tool-definitions';
import type { ToolExecutorContext, ToolExecutionResult } from './tool-executor';
import { executeGmToolCallFromModel } from './tool-executor';
import { sanitizeGmNarrationText } from './sanitize-gm-narration';

/** NPC sheet tools — must run before `start_combat` so initiative includes new combatants. */
const GM_SPAWN_TOOL_NAMES = new Set(['spawn_npc', 'spawn_random_npc', 'spawn_unique_npc']);

/** Run after state-changing tools in the same step (e.g. damage before handing off initiative). */
const GM_COMBAT_STEP_TOOL_NAMES = new Set(['next_turn', 'advance_round']);

function gmToolExecutionPriority(functionName: string): number {
  if (GM_SPAWN_TOOL_NAMES.has(functionName)) return 0;
  if (functionName === 'start_combat') return 2;
  if (GM_COMBAT_STEP_TOOL_NAMES.has(functionName)) return 3;
  if (functionName === 'end_combat') return 4;
  return 1;
}

/**
 * Stable reorder of parallel tool calls: spawns first, ordinary tools, `start_combat`,
 * then `next_turn` / `advance_round`, then `end_combat`.
 */
export function sortGmToolCallsForExecution(calls: OpenRouterToolCall[]): OpenRouterToolCall[] {
  return [...calls].sort((a, b) => {
    const pa = gmToolExecutionPriority(a.function?.name ?? '');
    const pb = gmToolExecutionPriority(b.function?.name ?? '');
    return pa - pb;
  });
}

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

async function callOpenRouterChatOnce(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  tools?: boolean;
  /** OpenRouter unified reasoning (e.g. DeepSeek V3.2 thinking). */
  reasoning?: { effort: 'high' };
}): Promise<OpenRouterCompletionResult> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    temperature: 0.7,
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

export async function callOpenRouterChat(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  tools?: boolean;
  reasoning?: { effort: 'high' };
  /** Retries for transient HTTP / network failures (default 4). */
  maxRetries?: number;
}): Promise<OpenRouterCompletionResult> {
  const maxAttempts = Math.max(1, params.maxRetries ?? 4);
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await callOpenRouterChatOnce(params);
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
  reasoning?: { effort: 'high' };
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
      reasoning: params.reasoning,
    });
    lastRaw = raw;

    const toolCalls = extractToolCalls(raw);
    if (toolCalls.length === 0) {
      return { narration: sanitizeGmNarrationText(content ?? ''), lastRaw, toolLog };
    }

    const orderedToolCalls = sortGmToolCallsForExecution(toolCalls);

    const assistantMsg: OpenRouterChatMessage = {
      role: 'assistant',
      content: content ?? null,
      tool_calls: orderedToolCalls,
    };
    messages.push(assistantMsg);

    for (const tc of orderedToolCalls) {
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
    reasoning: params.reasoning,
  });
  lastRaw = raw;
  return { narration: sanitizeGmNarrationText(content ?? ''), lastRaw, toolLog };
}
