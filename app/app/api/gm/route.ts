import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { runGmCompletionAfterPlayerInsert } from '@/lib/gm/run-gm-completion-after-insert';
import { chatRowToMessage } from '@/lib/realtime/db-mapper';
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
  const loreBudget =
    typeof body.loreTokenBudget === 'number' && body.loreTokenBudget > 0 ? body.loreTokenBudget : 2000;
  const playerMessageMetadata =
    body.playerMessageMetadata && typeof body.playerMessageMetadata === 'object'
      ? body.playerMessageMetadata
      : {};

  if (!sessionId || !playerMessage) {
    return NextResponse.json({ error: 'sessionId and playerMessage are required' }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  if (!(await fetchSessionSnapshot(supabase, sessionId))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { data: inserted, error: playerInsertError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      speaker: speakerName,
      text: playerMessage,
      type: 'player',
      metadata: playerMessageMetadata,
    })
    .select('*')
    .single();

  if (playerInsertError || !inserted) {
    return NextResponse.json(
      { error: `Failed to save player message: ${playerInsertError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const playerMessageRow = chatRowToMessage(inserted as Record<string, unknown>);

  after(() => {
    void runGmCompletionAfterPlayerInsert({
      supabase,
      sessionId,
      playerMessage,
      speakerName,
      loreBudget,
      apiKey,
      model,
    });
  });

  return NextResponse.json({
    ok: true,
    narrationPending: true,
    playerMessage: playerMessageRow,
  });
}
