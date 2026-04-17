import { NextResponse } from 'next/server';
import type { ChatMessage } from '@/lib/types';
import { buildGmUserContent, CORE_GM_RULES } from '@/lib/gm/context-builder';
import { buildLoreInjection, loadDefaultLoreRules } from '@/lib/gm/lorebook';
import { runGmCompletionWithTools } from '@/lib/gm/openrouter';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { getServiceRoleClient } from '@/lib/supabase';
import { getOpenRouterApiKeyFromEnv } from '@/lib/gm/openrouter-env';

export const maxDuration = 120;

interface GmRequestBody {
  sessionId?: string;
  playerMessage?: string;
  speakerName?: string;
  /** Optional metadata for the player chat row (e.g. voice STT provenance). */
  playerMessageMetadata?: Record<string, unknown>;
  /** Override lore token budget (estimated tokens). */
  loreTokenBudget?: number;
}

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

export async function POST(request: Request) {
  const apiKey = getOpenRouterApiKeyFromEnv();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Set CP2020_OPENROUTER_API_KEY in app/.env.local (recommended). Legacy: OPENROUTER_API_KEY or OPENROUTER_KEY.',
      },
      { status: 503 },
    );
  }

  const model = process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-v3.2';

  let body: GmRequestBody;
  try {
    body = (await request.json()) as GmRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const playerMessage = body.playerMessage?.trim();
  const speakerName = body.speakerName?.trim() || 'Player';
  const loreBudget = typeof body.loreTokenBudget === 'number' && body.loreTokenBudget > 0 ? body.loreTokenBudget : 2000;
  const playerMessageMetadata =
    body.playerMessageMetadata && typeof body.playerMessageMetadata === 'object'
      ? body.playerMessageMetadata
      : {};

  if (!sessionId || !playerMessage) {
    return NextResponse.json({ error: 'sessionId and playerMessage are required' }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  const snapshot = await fetchSessionSnapshot(supabase, sessionId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { error: playerInsertError } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    speaker: speakerName,
    text: playerMessage,
    type: 'player',
    metadata: playerMessageMetadata,
  });

  if (playerInsertError) {
    return NextResponse.json({ error: `Failed to save player message: ${playerInsertError.message}` }, { status: 500 });
  }

  const now = Date.now();
  const playerChat: ChatMessage = {
    id: crypto.randomUUID(),
    speaker: speakerName,
    text: playerMessage,
    timestamp: now,
    type: 'player',
  };

  const chatHistory = [...snapshot.chatMessages, playerChat];
  const loreRules = loadDefaultLoreRules();
  const loreInjection = buildLoreInjection(playerMessage, loreBudget, loreRules);

  const userContent = buildGmUserContent({
    sessionName: snapshot.session.name,
    sessionSummary: snapshot.session.sessionSummary,
    activeScene: snapshot.session.activeScene,
    characters: snapshot.characters,
    chatHistory,
    playerMessage,
    messageSpeaker: speakerName,
    loreInjection,
  });

  const charactersById = new Map(snapshot.characters.map((c) => [c.id, c]));

  const toolErrors: { tool: string; error: string }[] = [];

  try {
    const { narration, toolLog } = await withRetry(() =>
      runGmCompletionWithTools({
        apiKey,
        model,
        systemPrompt: CORE_GM_RULES,
        userContent,
        toolContext: {
          supabase,
          sessionId,
          loreRules,
          charactersById,
        },
        onToolResult: (r) => {
          if (!r.ok) {
            toolErrors.push({ tool: r.name, error: r.error });
            console.error('[ai-gm] tool failure', { sessionId, tool: r.name, error: r.error });
          }
        },
      }),
    );

    if (narration.trim()) {
      const { error: narrErr } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        speaker: 'Game Master',
        text: narration.trim(),
        type: 'narration',
        metadata: { model },
      });
      if (narrErr) {
        console.error('[ai-gm] narration insert failed', { sessionId, error: narrErr.message });
        return NextResponse.json(
          {
            error: `Narration insert failed: ${narrErr.message}`,
            narration,
            toolResults: toolLog,
            toolErrors,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      narration,
      model,
      toolResults: toolLog,
      toolErrors,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[ai-gm] completion failed', { sessionId, error: message });
    const isDev = process.env.NODE_ENV === 'development';
    const openRouter401 =
      typeof message === 'string' &&
      (message.includes('401') || message.includes('invalid API key'));
    return NextResponse.json(
      {
        error: message,
        ...(isDev
          ? {
              debug: {
                openRouterKeyLength: apiKey.length,
                hint:
                  openRouter401 && apiKey.length > 0
                    ? '401 with a non-empty key: wrong key, or OS env OPENROUTER_API_KEY shadowing .env.local. Prefer CP2020_OPENROUTER_API_KEY in .env.local and remove any bad OPENROUTER_API_KEY from Windows env vars.'
                    : openRouter401 && apiKey.length === 0
                      ? 'Key is empty at runtime — check .env.local path (must be next to app/package.json) and restart `npm run dev`.'
                      : undefined,
              },
            }
          : {}),
      },
      { status: 502 },
    );
  }
}
