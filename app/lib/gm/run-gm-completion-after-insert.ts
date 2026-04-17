import { buildGmUserContent, CORE_GM_RULES } from '@/lib/gm/context-builder';
import { buildLoreInjection, loadDefaultLoreRules } from '@/lib/gm/lorebook';
import { runGmCompletionWithTools } from '@/lib/gm/openrouter';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import type { SupabaseClient } from '@supabase/supabase-js';

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts - 1) break;
    }
  }
  throw last;
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
}): Promise<void> {
  const snapshot = await fetchSessionSnapshot(opts.supabase, opts.sessionId);
  if (!snapshot) {
    console.error('[ai-gm] background: session snapshot missing', { sessionId: opts.sessionId });
    return;
  }

  const chatHistory = snapshot.chatMessages;
  const loreRules = loadDefaultLoreRules();
  const loreInjection = buildLoreInjection(opts.playerMessage, opts.loreBudget, loreRules);

  const userContent = buildGmUserContent({
    sessionName: snapshot.session.name,
    sessionSummary: snapshot.session.sessionSummary,
    activeScene: snapshot.session.activeScene,
    characters: snapshot.characters,
    chatHistory,
    playerMessage: opts.playerMessage,
    messageSpeaker: opts.speakerName,
    loreInjection,
  });

  const charactersById = new Map(snapshot.characters.map((c) => [c.id, c]));

  const toolErrors: { tool: string; error: string }[] = [];

  try {
    const { narration, toolLog } = await withRetry(() =>
      runGmCompletionWithTools({
        apiKey: opts.apiKey,
        model: opts.model,
        systemPrompt: CORE_GM_RULES,
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
            console.error('[ai-gm] tool failure', { sessionId: opts.sessionId, tool: r.name, error: r.error });
          }
        },
      }),
    );

    if (narration.trim()) {
      const { error: narrErr } = await opts.supabase.from('chat_messages').insert({
        session_id: opts.sessionId,
        speaker: 'Game Master',
        text: narration.trim(),
        type: 'narration',
        metadata: { model: opts.model },
      });
      if (narrErr) {
        console.error('[ai-gm] narration insert failed', { sessionId: opts.sessionId, error: narrErr.message });
      }
    }

    if (toolErrors.length > 0) {
      console.error('[ai-gm] background tool errors', { sessionId: opts.sessionId, toolErrors });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[ai-gm] background completion failed', { sessionId: opts.sessionId, error: message });
  }
}
