import { NextResponse } from 'next/server';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { getServiceRoleClient } from '@/lib/supabase';

export const maxDuration = 60;

interface FragmentBody {
  sessionId?: string;
  turnId?: string;
  userId?: string;
  speakerName?: string;
  characterId?: string | null;
  playerMessage?: string;
  playerMessageMetadata?: Record<string, unknown>;
  anchorMs?: number;
  pendingRolls?: Array<{ rolledAtMs: number; playerMessage: string }>;
}

export async function POST(request: Request) {
  let body: FragmentBody;
  try {
    body = (await request.json()) as FragmentBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const turnId = body.turnId?.trim();
  const userId = body.userId?.trim();
  const speakerName = body.speakerName?.trim() || 'Player';
  const playerMessage = body.playerMessage?.trim();
  const anchorMs = typeof body.anchorMs === 'number' && Number.isFinite(body.anchorMs) ? body.anchorMs : NaN;
  const characterId =
    typeof body.characterId === 'string' && body.characterId.length > 0 ? body.characterId : null;
  const playerMessageMetadata =
    body.playerMessageMetadata && typeof body.playerMessageMetadata === 'object'
      ? body.playerMessageMetadata
      : {};
  const pendingRolls = Array.isArray(body.pendingRolls)
    ? body.pendingRolls.filter(
        (r): r is { rolledAtMs: number; playerMessage: string } =>
          r != null &&
          typeof r === 'object' &&
          typeof (r as { rolledAtMs?: unknown }).rolledAtMs === 'number' &&
          typeof (r as { playerMessage?: unknown }).playerMessage === 'string',
      )
    : [];

  if (!sessionId || !turnId || !userId || !playerMessage) {
    return NextResponse.json(
      { error: 'sessionId, turnId, userId, and playerMessage are required' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(anchorMs)) {
    return NextResponse.json({ error: 'anchorMs must be a finite number' }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  if (!(await fetchSessionSnapshot(supabase, sessionId))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const row = {
    session_id: sessionId,
    turn_id: turnId,
    user_id: userId,
    speaker_name: speakerName,
    character_id: characterId,
    player_message: playerMessage,
    player_message_metadata: playerMessageMetadata,
    anchor_ms: Math.round(anchorMs),
    pending_rolls: pendingRolls,
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
          player_message_metadata: playerMessageMetadata,
          anchor_ms: Math.round(anchorMs),
          pending_rolls: pendingRolls,
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
