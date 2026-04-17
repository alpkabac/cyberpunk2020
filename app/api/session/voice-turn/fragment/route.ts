import { NextResponse } from 'next/server';
import { voiceTurnFragmentBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { assertPlayerVoiceCharacterAllowed } from '@/lib/auth/player-voice-character';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { getServiceRoleClient } from '@/lib/supabase';

export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = voiceTurnFragmentBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/session/voice-turn/fragment:body');
  }

  const {
    sessionId,
    turnId,
    userId,
    speakerName,
    playerMessage,
    anchorMs,
    characterId,
    playerMessageMetadata,
    pendingRolls,
  } = parsed.data;
  const meta = playerMessageMetadata ?? {};
  const rolls = pendingRolls ?? [];

  if (userId !== auth.user.id) {
    return NextResponse.json({ error: 'userId must match authenticated user' }, { status: 403 });
  }

  const supabase = getServiceRoleClient();
  if (!(await fetchSessionSnapshot(supabase, sessionId))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const allowed = await userHasSessionAccess(supabase, sessionId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const charDeny = await assertPlayerVoiceCharacterAllowed(supabase, sessionId, characterId, auth.user.id);
  if (charDeny) return charDeny;

  const row = {
    session_id: sessionId,
    turn_id: turnId,
    user_id: userId,
    speaker_name: speakerName,
    character_id: characterId,
    player_message: playerMessage,
    player_message_metadata: meta,
    anchor_ms: Math.round(anchorMs),
    pending_rolls: rolls,
  };

  const { error: insErr } = await supabase.from('session_voice_turn_fragments').insert(row);

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === '23505') {
      const { error: upErr } = await supabase
        .from('session_voice_turn_fragments')
        .update({
          speaker_name: speakerName,
          character_id: characterId,
          player_message: playerMessage,
          player_message_metadata: meta,
          anchor_ms: Math.round(anchorMs),
          pending_rolls: rolls,
        })
        .eq('turn_id', turnId)
        .eq('user_id', userId);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
