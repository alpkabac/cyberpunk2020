import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { gmRegenerateBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { runGmCompletionAfterPlayerInsert } from '@/lib/gm/run-gm-completion-after-insert';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { getOpenRouterApiKeyFromEnv } from '@/lib/gm/openrouter-env';
import { defaultGmOpenRouterEnvModel, resolveGmOpenRouterCall } from '@/lib/gm/gm-openrouter-models';
import {
  findLastPlayerBeforeIndex,
  indexOfMessageId,
  orderedChatMessages,
  sliceFromMessageInclusive,
} from '@/lib/session/chat-mutations';

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

  const envModel = defaultGmOpenRouterEnvModel();

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = gmRegenerateBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/gm/regenerate');
  }

  const { sessionId, narrationMessageId, loreTokenBudget, openRouterModel } = parsed.data;
  const loreBudget = loreTokenBudget && loreTokenBudget > 0 ? loreTokenBudget : 2000;
  const { model, reasoning: openRouterReasoning } = resolveGmOpenRouterCall(openRouterModel, envModel);

  const supabase = getServiceRoleClient();
  const snapshot = await fetchSessionSnapshot(supabase, sessionId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (!(await userHasSessionAccess(supabase, sessionId, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sorted = orderedChatMessages(snapshot.chatMessages);
  const i = indexOfMessageId(sorted, narrationMessageId);
  if (i === -1) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const target = sorted[i];
  if (target.type !== 'narration' || target.speaker !== 'Game Master') {
    return NextResponse.json({ error: 'Can only regenerate Game Master narration' }, { status: 400 });
  }

  const playerMsg = findLastPlayerBeforeIndex(sorted, i);
  if (!playerMsg) {
    return NextResponse.json(
      { error: 'No player message before this narration to replay from' },
      { status: 400 },
    );
  }

  const tail = sliceFromMessageInclusive(snapshot.chatMessages, narrationMessageId);
  if (!tail?.length) {
    return NextResponse.json({ error: 'Message not found in session' }, { status: 404 });
  }

  const deletedIds = tail.map((m) => m.id);
  const { error: delErr } = await supabase.from('chat_messages').delete().in('id', deletedIds);

  if (delErr) {
    reportServerError('api/gm/regenerate:truncate', new Error(delErr.message), {
      sessionId,
      narrationMessageId,
    });
    return NextResponse.json({ error: 'Failed to clear messages for regeneration' }, { status: 500 });
  }

  const meta = playerMsg.metadata ?? {};
  after(() => {
    void runGmCompletionAfterPlayerInsert({
      supabase,
      sessionId,
      playerMessage: playerMsg.text,
      speakerName: playerMsg.speaker,
      loreBudget,
      apiKey,
      model,
      openRouterReasoning,
      playerMessageMetadata: Object.keys(meta).length > 0 ? meta : null,
    });
  });

  return NextResponse.json({ ok: true, narrationPending: true, deletedIds });
}
