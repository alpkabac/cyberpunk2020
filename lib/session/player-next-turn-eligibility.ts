/**
 * Who may POST `next_turn` besides the session GM.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCombatStateJson } from './combat-state';

export async function assertEligiblePlayerNextTurn(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: sessRow, error: sErr } = await supabase
    .from('sessions')
    .select('combat_state')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr || !sessRow) return { ok: false, error: 'Session not found' };

  const combat = parseCombatStateJson((sessRow as { combat_state?: unknown }).combat_state);
  if (!combat?.entries?.length) return { ok: false, error: 'No active combat' };

  const entry = combat.entries[combat.activeTurnIndex];
  if (!entry) return { ok: false, error: 'Invalid combat state' };

  const { data: charRow, error: cErr } = await supabase
    .from('characters')
    .select('id, user_id, type')
    .eq('id', entry.characterId)
    .eq('session_id', sessionId)
    .maybeSingle();
  if (cErr || !charRow) return { ok: false, error: 'Active combatant not found' };

  const type = (charRow as { type?: string }).type;
  const rowUser = (charRow as { user_id?: string | null }).user_id ?? null;
  if (type !== 'character') {
    return { ok: false, error: 'Only the session GM can advance initiative on this turn' };
  }
  if (rowUser !== userId) {
    return { ok: false, error: 'You can only end your own player character turn' };
  }
  if (combat.startOfTurnSavesPendingFor === entry.characterId) {
    return { ok: false, error: 'Resolve start-of-turn saves before ending your turn' };
  }
  return { ok: true };
}
