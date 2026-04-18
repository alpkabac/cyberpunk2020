import { NextResponse } from 'next/server';
import { sessionCombatPostBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { characterRowEditableByUser } from '@/lib/auth/character-edit-policy';
import { userHasSessionAccess, userIsSessionGm } from '@/lib/auth/session-access';
import { assertEligiblePlayerNextTurn } from '@/lib/session/player-next-turn-eligibility';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { parseCombatStateJson } from '@/lib/session/combat-state';
import {
  sessionAdvanceRound,
  sessionClearStartOfTurnSavesPending,
  sessionEndCombat,
  sessionNextTurn,
  sessionStartCombat,
} from '@/lib/session/session-combat-service';
import { getServiceRoleClient } from '@/lib/supabase';

export async function POST(
  request: Request,
  segmentCtx: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const { sessionId } = await segmentCtx.params;

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = sessionCombatPostBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/session/[sessionId]/combat:body');
  }

  const supabase = getServiceRoleClient();
  if (!(await fetchSessionSnapshot(supabase, sessionId))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { action, clear_timed_conditions: clearTimed, narration } = parsed.data;

  if (action === 'clear_turn_saves_pending') {
    const access = await userHasSessionAccess(supabase, sessionId, auth.user.id);
    if (!access) {
      return NextResponse.json({ error: 'Not a participant in this session' }, { status: 403 });
    }
    const { data: sessRow, error: sErr } = await supabase
      .from('sessions')
      .select('combat_state, created_by')
      .eq('id', sessionId)
      .maybeSingle();
    if (sErr || !sessRow) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const combat = parseCombatStateJson(
      (sessRow as { combat_state?: unknown }).combat_state,
    );
    const pending = combat?.startOfTurnSavesPendingFor;
    if (!pending) {
      return NextResponse.json({ error: 'No start-of-turn saves pending' }, { status: 400 });
    }
    const { data: charRow, error: cErr } = await supabase
      .from('characters')
      .select('id, user_id, type')
      .eq('id', pending)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (cErr || !charRow) {
      return NextResponse.json({ error: 'Pending character not found' }, { status: 404 });
    }
    const ctype = (charRow as { type?: string }).type;
    if (ctype !== 'character' && ctype !== 'npc') {
      return NextResponse.json({ error: 'Invalid character row' }, { status: 400 });
    }
    const createdBy = (sessRow as { created_by?: string | null }).created_by ?? null;
    if (
      !characterRowEditableByUser({
        viewerUserId: auth.user.id,
        characterUserId: (charRow as { user_id?: string | null }).user_id,
        characterType: ctype as 'character' | 'npc',
        sessionCreatorId: createdBy,
      })
    ) {
      return NextResponse.json({ error: 'You cannot clear saves for this character' }, { status: 403 });
    }
    const r = await sessionClearStartOfTurnSavesPending(supabase, sessionId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, combat_state: r.combat_state });
  }

  const isGm = await userIsSessionGm(supabase, sessionId, auth.user.id);

  if (action === 'next_turn') {
    if (!isGm) {
      const access = await userHasSessionAccess(supabase, sessionId, auth.user.id);
      if (!access) {
        return NextResponse.json({ error: 'Not a participant in this session' }, { status: 403 });
      }
      const gate = await assertEligiblePlayerNextTurn(supabase, sessionId, auth.user.id);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: 403 });
      }
    }
    const r = await sessionNextTurn(supabase, sessionId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, combat_state: r.combat_state });
  }

  if (!isGm) {
    return NextResponse.json({ error: 'Only the session GM may update combat' }, { status: 403 });
  }

  if (action === 'start_combat') {
    const r = await sessionStartCombat(supabase, sessionId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, combat_state: r.combat_state });
  }

  if (action === 'advance_round') {
    const r = await sessionAdvanceRound(supabase, sessionId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, combat_state: r.combat_state });
  }

  const r = await sessionEndCombat(supabase, sessionId, {
    clear_timed_conditions: clearTimed === true,
    narration,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, combat_state: null });
}
