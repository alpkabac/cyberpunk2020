import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { voiceTurnMergeBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { runGmCompletionAfterPlayerInsert } from '@/lib/gm/run-gm-completion-after-insert';
import { chatRowToMessage } from '@/lib/realtime/db-mapper';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { getServiceRoleClient } from '@/lib/supabase';
import { getOpenRouterApiKeyFromEnv } from '@/lib/gm/openrouter-env';
import { defaultGmOpenRouterEnvModel, resolveGmOpenRouterCall } from '@/lib/gm/gm-openrouter-models';
import { mergeSessionVoiceTurnFragmentsForGm } from '@/lib/voice/merge-session-voice-fragments';

export const maxDuration = 120;

const STABILITY_MS = 1800;

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

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = voiceTurnMergeBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/session/voice-turn/merge:body');
  }

  const { sessionId, turnId, openRouterModel } = parsed.data;

  const envModel = defaultGmOpenRouterEnvModel();
  const { model, reasoning: openRouterReasoning } = resolveGmOpenRouterCall(openRouterModel, envModel);
  const loreBudget = 2000;

  const supabase = getServiceRoleClient();
  if (!(await fetchSessionSnapshot(supabase, sessionId))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const allowed = await userHasSessionAccess(supabase, sessionId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: frags, error: selErr } = await supabase
    .from('session_voice_turn_fragments')
    .select('*')
    .eq('turn_id', turnId)
    .eq('session_id', sessionId);

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  if (!frags?.length) {
    return NextResponse.json({ error: 'NO_FRAGMENTS', code: 'NO_FRAGMENTS' }, { status: 400 });
  }

  const latest = Math.max(
    ...frags.map((f) => {
      const c = f.created_at ? new Date(String(f.created_at)).getTime() : 0;
      return Number.isFinite(c) ? c : 0;
    }),
  );
  if (Date.now() - latest < STABILITY_MS) {
    return NextResponse.json({ retryAfterMs: STABILITY_MS }, { status: 202 });
  }

  const { error: lockErr } = await supabase.from('session_voice_turns').insert({
    turn_id: turnId,
    session_id: sessionId,
  });

  if (lockErr) {
    const code = (lockErr as { code?: string }).code;
    if (code === '23505') {
      const { data: existing } = await supabase
        .from('session_voice_turns')
        .select('chat_message_id')
        .eq('turn_id', turnId)
        .maybeSingle();
      if (existing?.chat_message_id) {
        return NextResponse.json({ ok: true, alreadyMerged: true, chatMessageId: existing.chat_message_id });
      }
      return NextResponse.json({ retryAfterMs: 500 }, { status: 202 });
    }
    return NextResponse.json({ error: lockErr.message }, { status: 500 });
  }

  const { data: frags2, error: sel2Err } = await supabase
    .from('session_voice_turn_fragments')
    .select('*')
    .eq('turn_id', turnId)
    .eq('session_id', sessionId);

  if (sel2Err || !frags2?.length) {
    await supabase.from('session_voice_turns').delete().eq('turn_id', turnId);
    return NextResponse.json({ error: 'Fragments disappeared' }, { status: 500 });
  }

  const inputs = frags2.map((row) => ({
    anchorMs: Number(row.anchor_ms),
    playerMessage: String(row.player_message ?? ''),
    pendingRolls: Array.isArray(row.pending_rolls)
      ? (row.pending_rolls as Array<{ rolledAtMs: number; playerMessage: string }>)
      : [],
  }));

  const merged = mergeSessionVoiceTurnFragmentsForGm(inputs);
  const speakerName =
    frags2.length === 1 ? String(frags2[0].speaker_name ?? 'Player') : 'Group voice';

  const { data: inserted, error: playerInsertError } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      speaker: speakerName,
      text: merged.playerMessage,
      type: 'player',
      metadata: {
        ...merged.playerMessageMetadata,
        sessionVoiceTurnId: turnId,
        mergedFragmentCount: frags2.length,
      },
    })
    .select('*')
    .single();

  if (playerInsertError || !inserted) {
    await supabase.from('session_voice_turns').delete().eq('turn_id', turnId);
    return NextResponse.json(
      { error: `Failed to save merged message: ${playerInsertError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const msgId = String((inserted as Record<string, unknown>).id ?? '');
  await supabase
    .from('session_voice_turns')
    .update({ chat_message_id: msgId })
    .eq('turn_id', turnId);

  const playerMessageRow = chatRowToMessage(inserted as Record<string, unknown>);

  after(() => {
    void runGmCompletionAfterPlayerInsert({
      supabase,
      sessionId,
      playerMessage: merged.playerMessage,
      speakerName,
      loreBudget,
      apiKey,
      model,
      openRouterReasoning,
    });
  });

  return NextResponse.json({
    ok: true,
    alreadyMerged: false,
    playerMessage: playerMessageRow,
  });
}
