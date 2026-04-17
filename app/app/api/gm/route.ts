import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { gmPostBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { runGmCompletionAfterPlayerInsert } from '@/lib/gm/run-gm-completion-after-insert';
import { chatRowToMessage } from '@/lib/realtime/db-mapper';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { getOpenRouterApiKeyFromEnv } from '@/lib/gm/openrouter-env';

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

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

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = gmPostBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/gm:body');
  }

  const { sessionId, playerMessage, speakerName, loreTokenBudget, playerMessageMetadata } = parsed.data;
  const loreBudget = loreTokenBudget && loreTokenBudget > 0 ? loreTokenBudget : 2000;
  const meta = playerMessageMetadata ?? {};

  const supabase = getServiceRoleClient();
  if (!(await fetchSessionSnapshot(supabase, sessionId))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const allowed = await userHasSessionAccess(supabase, sessionId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: inserted, error: playerInsertError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      speaker: speakerName,
      text: playerMessage,
      type: 'player',
      metadata: meta,
    })
    .select('*')
    .single();

  if (playerInsertError || !inserted) {
    reportServerError(
      'api/gm:player-insert',
      new Error(playerInsertError?.message ?? 'insert returned no row'),
      { sessionId },
    );
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
      playerMessageMetadata: Object.keys(meta).length > 0 ? meta : null,
    });
  });

  return NextResponse.json({
    ok: true,
    narrationPending: true,
    playerMessage: playerMessageRow,
  });
}
