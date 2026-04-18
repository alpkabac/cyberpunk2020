import { NextResponse } from 'next/server';
import { gmPostBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { runGmCompletionStreamingWithSse } from '@/lib/gm/run-gm-completion-stream';
import { chatRowToMessage } from '@/lib/realtime/db-mapper';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { getOpenRouterApiKeyFromEnv } from '@/lib/gm/openrouter-env';
import { defaultGmOpenRouterEnvModel, resolveGmOpenRouterCall } from '@/lib/gm/gm-openrouter-models';

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

  const parsed = gmPostBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/gm/stream:body');
  }

  const { sessionId, playerMessage, speakerName, loreTokenBudget, playerMessageMetadata, openRouterModel } =
    parsed.data;
  const loreBudget = loreTokenBudget && loreTokenBudget > 0 ? loreTokenBudget : 2000;
  const meta = playerMessageMetadata ?? {};
  const { model, reasoning: openRouterReasoning } = resolveGmOpenRouterCall(openRouterModel, envModel);

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
      'api/gm/stream:player-insert',
      new Error(playerInsertError?.message ?? 'insert returned no row'),
      { sessionId },
    );
    return NextResponse.json(
      { error: `Failed to save player message: ${playerInsertError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const playerMessageRow = chatRowToMessage(inserted as Record<string, unknown>);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const safeWrite = (event: string, data: Record<string, unknown>) => {
        try {
          write(event, data);
        } catch {
          /* Consumer disconnected — keep generating and saving narration to the DB. */
        }
      };

      safeWrite('open', {
        ok: true,
        narrationPending: true,
        playerMessage: playerMessageRow,
      });

      void (async () => {
        try {
          await runGmCompletionStreamingWithSse({
            supabase,
            sessionId,
            playerMessage,
            speakerName,
            loreBudget,
            apiKey,
            model,
            openRouterReasoning,
            playerMessageMetadata: Object.keys(meta).length > 0 ? meta : null,
            write: safeWrite,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          reportServerError('api/gm/stream:completion', e instanceof Error ? e : new Error(message), {
            sessionId,
          });
          try {
            safeWrite('error', { message: message || 'Stream failed' });
          } catch {
            /* stream may be closed */
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
