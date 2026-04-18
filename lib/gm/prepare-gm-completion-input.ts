import {
  buildGmSystemPrompt,
  buildGmUserContentWithinInputTokenBudget,
} from '@/lib/gm/context-builder';
import { buildLoreInjection } from '@/lib/gm/lorebook';
import { loadDefaultLoreRules } from '@/lib/gm/load-lore-rules';
import { getGmMaxChatMessagesFromEnv, getGmMaxInputTokensFromEnv } from '@/lib/gm/openrouter-env';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { loadScenarioMarkdownForGm } from '@/lib/scenarios/load-scenario-markdown';
import { scenarioHandoutsForSession } from '@/lib/gm/scenario-handouts-for-gm';
import { parseActiveScenarioId } from '@/lib/scenarios/catalog';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolExecutorContext } from '@/lib/gm/tool-executor';
import { reportServerError } from '@/lib/logging/server-report';

export interface PreparedGmCompletion {
  systemPrompt: string;
  userContent: string;
  toolContext: ToolExecutorContext;
  model: string;
  openRouterReasoning?: { effort: 'high' };
}

/**
 * Shared prompt + tool context for both background and streaming GM completions.
 */
export async function prepareGmCompletionInput(opts: {
  supabase: SupabaseClient;
  sessionId: string;
  playerMessage: string;
  speakerName: string;
  loreBudget: number;
  model: string;
  openRouterReasoning?: { effort: 'high' };
  playerMessageMetadata?: Record<string, unknown> | null;
}): Promise<PreparedGmCompletion | null> {
  const snapshot = await fetchSessionSnapshot(opts.supabase, opts.sessionId);
  if (!snapshot) {
    reportServerError('ai-gm:no-snapshot', new Error('session snapshot missing'), {
      sessionId: opts.sessionId,
    });
    return null;
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
  const activeScenarioId = parseActiveScenarioId(snapshot.session.settings.activeScenarioId);
  const sceneHandouts = scenarioHandoutsForSession(
    snapshot.session.name,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    activeScenarioId,
  );
  const allowedSceneImageUrls =
    sceneHandouts.length > 0 ? new Set(sceneHandouts.map((h) => h.url)) : undefined;

  const toolContext: ToolExecutorContext = {
    supabase: opts.supabase,
    sessionId: opts.sessionId,
    loreRules,
    charactersById,
    allowedSceneImageUrls,
  };

  return {
    systemPrompt,
    userContent,
    toolContext,
    model: opts.model,
    openRouterReasoning: opts.openRouterReasoning,
  };
}
