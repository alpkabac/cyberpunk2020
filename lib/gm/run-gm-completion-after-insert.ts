import {
  buildGmSystemPrompt,
  buildGmUserContentWithinInputTokenBudget,
} from '@/lib/gm/context-builder';
import { buildLoreInjection } from '@/lib/gm/lorebook';
import { loadDefaultLoreRules } from '@/lib/gm/load-lore-rules';
import { reportServerError } from '@/lib/logging/server-report';
import { getGmMaxChatMessagesFromEnv, getGmMaxInputTokensFromEnv } from '@/lib/gm/openrouter-env';
import { runGmCompletionWithTools } from '@/lib/gm/openrouter';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { loadScenarioMarkdownForGm } from '@/lib/scenarios/load-scenario-markdown';
import type { SupabaseClient } from '@supabase/supabase-js';

const FALLBACK_GM_LINE =
  '*(The AI Game Master is temporarily unavailable — please try sending your message again in a moment.)*';

function isRetriableCompletionError(message: string): boolean {
  if (/OpenRouter error (\d+)/.test(message)) {
    const m = /OpenRouter error (\d+)/.exec(message);
    const status = m ? parseInt(m[1]!, 10) : 0;
    return status === 429 || status === 502 || status === 503 || status === 504;
  }
  return /fetch|network|ECONNRESET|ETIMEDOUT|Failed to fetch|ECONNREFUSED/i.test(message);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i === attempts - 1 || !isRetriableCompletionError(msg)) {
        break;
      }
      await sleep(400 * Math.pow(2, i));
    }
  }
  throw last;
}

async function insertFallbackNarration(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    speaker: 'Game Master',
    text: FALLBACK_GM_LINE,
    type: 'narration',
    metadata: { fallback: true, reason: 'openrouter_or_completion_failure' },
  });
  if (error) {
    reportServerError('ai-gm:fallback-insert-failed', new Error(error.message), { sessionId });
  }
}

/**
 * Runs after the HTTP response so the client can show the player message immediately.
 */
export async function runGmCompletionAfterPlayerInsert(opts: {
  supabase: SupabaseClient;
  sessionId: string;
  playerMessage: string;
  speakerName: string;
  loreBudget: number;
  apiKey: string;
  model: string;
  playerMessageMetadata?: Record<string, unknown> | null;
}): Promise<void> {
  const snapshot = await fetchSessionSnapshot(opts.supabase, opts.sessionId);
  if (!snapshot) {
    reportServerError('ai-gm:background-no-snapshot', new Error('session snapshot missing'), {
      sessionId: opts.sessionId,
    });
    return;
  }

  const chatHistory = snapshot.chatMessages;
  const loreRules = loadDefaultLoreRules();
  const loreInjection = buildLoreInjection(opts.playerMessage, opts.loreBudget, loreRules);
  const scenarioDocumentText = loadScenarioMarkdownForGm(snapshot.session.settings.activeScenarioId);

  const systemPrompt = buildGmSystemPrompt(snapshot.session.settings);
  const maxInputTokens = getGmMaxInputTokensFromEnv();
  const { userContent, estimatedInputTokens, omittedOlderCount } = buildGmUserContentWithinInputTokenBudget(
    {
      sessionName: snapshot.session.name,
      sessionSummary: snapshot.session.sessionSummary,
      activeScene: snapshot.session.activeScene,
      characters: snapshot.characters,
      combatState: snapshot.session.combatState,
      mapTokens: snapshot.tokens,
      sessionSettings: snapshot.session.settings,
      mapCoverRegions: snapshot.session.mapState.coverRegions,
      mapSuppressiveZones: snapshot.session.mapState.suppressiveZones,
      mapSuppressivePending: snapshot.session.mapState.pendingSuppressivePlacements,
      chatHistory,
      playerMessage: opts.playerMessage,
      messageSpeaker: opts.speakerName,
      loreInjection,
      scenarioDocumentText,
      playerMessageMetadata: opts.playerMessageMetadata ?? null,
    },
    systemPrompt,
    maxInputTokens,
    { maxChatMessagesCeiling: getGmMaxChatMessagesFromEnv() },
  );
  if (estimatedInputTokens > maxInputTokens) {
    reportServerError(
      'ai-gm:context-exceeds-budget',
      new Error('GM prompt still exceeds CP2020_GM_MAX_INPUT_TOKENS after trimming chat'),
      { sessionId: opts.sessionId, estimatedInputTokens, omittedOlderCount },
    );
  }

  const charactersById = new Map(snapshot.characters.map((c) => [c.id, c]));

  const toolErrors: { tool: string; error: string }[] = [];
  let toolStepCount = 0;

  try {
    const { narration, toolLog } = await withRetry(() =>
      runGmCompletionWithTools({
        apiKey: opts.apiKey,
        model: opts.model,
        systemPrompt,
        userContent,
        toolContext: {
          supabase: opts.supabase,
          sessionId: opts.sessionId,
          loreRules,
          charactersById,
        },
        onToolResult: (r) => {
          if (!r.ok) {
            toolErrors.push({ tool: r.name, error: r.error });
            reportServerError('ai-gm:tool-failure', new Error(r.error), {
              sessionId: opts.sessionId,
              tool: r.name,
            });
          }
        },
      }),
    );
    toolStepCount = toolLog.length;

    if (narration.trim()) {
      const { error: narrErr } = await opts.supabase.from('chat_messages').insert({
        session_id: opts.sessionId,
        speaker: 'Game Master',
        text: narration.trim(),
        type: 'narration',
        metadata: { model: opts.model },
      });
      if (narrErr) {
        reportServerError('ai-gm:narration-insert-failed', new Error(narrErr.message), {
          sessionId: opts.sessionId,
        });
      }
    } else {
      await insertFallbackNarration(opts.supabase, opts.sessionId);
    }

    if (toolErrors.length > 0) {
      reportServerError('ai-gm:background-tool-errors', new Error('one or more tools failed'), {
        sessionId: opts.sessionId,
        toolErrors,
        toolStepCount,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    reportServerError('ai-gm:background-completion-failed', e instanceof Error ? e : new Error(message), {
      sessionId: opts.sessionId,
    });
    await insertFallbackNarration(opts.supabase, opts.sessionId);
  }
}
