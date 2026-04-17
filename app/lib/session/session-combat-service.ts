/**
 * Authoritative combat round / initiative updates (Postgres + chat).
 * Used by AI-GM tools and the session combat API (service-role writes + condition ticks on all sheets).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { saveCharacterToSupabase } from '../db/character-serialize';
import { characterRowToCharacter } from '../realtime/db-mapper';
import type { Character, ChatMessage, CombatState, InitiativeEntry } from '../types';
import { combatStateToJson, parseCombatStateJson, rollInitiativeEntry, sortInitiativeEntries } from './combat-state';
import { stripTimedConditions, tickConditionsOneRound } from './combat-condition-tick';
import { recalcCharacterForGm } from '../gm/character-mutations';
import {
  npcApplyDeathSave,
  npcApplyStunRecoverySave,
  rollFlatD10,
} from '../gm/npc-save-rolls';

async function insertChatLine(
  supabase: SupabaseClient,
  sessionId: string,
  text: string,
  type: ChatMessage['type'] = 'system',
  metadata: Record<string, unknown> = {},
): Promise<Error | null> {
  const { error } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    speaker: 'Game Master',
    text,
    type,
    metadata,
  });
  return error ? new Error(error.message) : null;
}

async function fetchSessionCombatState(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<CombatState | null> {
  const { data, error } = await supabase.from('sessions').select('combat_state').eq('id', sessionId).maybeSingle();
  if (error || !data) return null;
  return parseCombatStateJson((data as { combat_state?: unknown }).combat_state);
}

async function persistCombatState(
  supabase: SupabaseClient,
  sessionId: string,
  state: CombatState | null,
): Promise<Error | null> {
  const { error } = await supabase
    .from('sessions')
    .update({ combat_state: state ? combatStateToJson(state) : null })
    .eq('id', sessionId);
  return error ? new Error(error.message) : null;
}

async function loadSessionCharacters(supabase: SupabaseClient, sessionId: string): Promise<Character[]> {
  const { data, error } = await supabase.from('characters').select('*').eq('session_id', sessionId);
  if (error || !data) return [];
  return data.map((r) => characterRowToCharacter(r as Record<string, unknown>));
}

function formatInitiativeLine(entries: InitiativeEntry[]): string {
  const parts = entries.map((e) => {
    const tail: string[] = [`d10 ${e.d10Detail}`];
    if (e.initiativeMod !== 0) tail.push(`${e.initiativeMod > 0 ? '+' : ''}${e.initiativeMod} mod`);
    if (e.combatSense !== 0) tail.push(`CS ${e.combatSense}`);
    if (e.cyberInitiativeBonus !== 0) {
      tail.push(`${e.cyberInitiativeBonus > 0 ? '+' : ''}${e.cyberInitiativeBonus} booster`);
    }
    return `**${e.name}** ${e.total} (REF ${e.ref} + ${tail.join(' + ')})`;
  });
  return `Combat — Round 1 begins. Initiative: ${parts.join('; ')}.`;
}

export async function sessionStartCombat(
  supabase: SupabaseClient,
  sessionId: string,
  opts?: { post_chat?: boolean },
): Promise<{ ok: true; combat_state: CombatState } | { ok: false; error: string }> {
  const chars = await loadSessionCharacters(supabase, sessionId);
  if (chars.length === 0) return { ok: false, error: 'No characters in session' };

  const entries = sortInitiativeEntries(chars.map((c) => rollInitiativeEntry(c)));
  const state: CombatState = {
    round: 1,
    activeTurnIndex: 0,
    entries,
  };

  const err = await persistCombatState(supabase, sessionId, state);
  if (err) return { ok: false, error: err.message };

  if (opts?.post_chat !== false) {
    const chatErr = await insertChatLine(supabase, sessionId, formatInitiativeLine(entries), 'system', {
      kind: 'combat_start',
      combat_state: combatStateToJson(state),
    });
    if (chatErr) return { ok: false, error: chatErr.message };
  }

  return { ok: true, combat_state: state };
}

export async function sessionNextTurn(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ ok: true; combat_state: CombatState } | { ok: false; error: string }> {
  const current = await fetchSessionCombatState(supabase, sessionId);
  if (!current || current.entries.length === 0) {
    return { ok: false, error: 'No active combat' };
  }

  let state: CombatState = {
    ...current,
    activeTurnIndex: (current.activeTurnIndex + 1) % current.entries.length,
    startOfTurnSavesPendingFor: null,
  };

  const chars = await loadSessionCharacters(supabase, sessionId);
  const byId = new Map(chars.map((c) => [c.id, c]));

  const maxPasses = Math.max(2, current.entries.length + 2);
  for (let pass = 0; pass < maxPasses; pass++) {
    const entry = state.entries[state.activeTurnIndex];
    if (!entry) break;

    let c = byId.get(entry.characterId);
    if (!c) {
      state = { ...state, startOfTurnSavesPendingFor: null };
      break;
    }
    c = recalcCharacterForGm(c);
    byId.set(c.id, c);

    if (c.damage >= 41) {
      state = {
        ...state,
        activeTurnIndex: (state.activeTurnIndex + 1) % state.entries.length,
        startOfTurnSavesPendingFor: null,
      };
      continue;
    }

    if (c.type !== 'npc') {
      const needsPending =
        c.damage < 41 &&
        (c.isStunned ||
          ((c.derivedStats?.deathSaveTarget ?? -1) >= 0 && !c.isStabilized));
      state = {
        ...state,
        ...(needsPending ? { startOfTurnSavesPendingFor: c.id } : { startOfTurnSavesPendingFor: null }),
      };
      break;
    }

    let working = c;

    if (working.isStunned) {
      const roll = rollFlatD10();
      const r = npcApplyStunRecoverySave(working, roll);
      working = r.character;
      byId.set(working.id, working);
      const { error: saveErr } = await saveCharacterToSupabase(supabase, working);
      if (saveErr) return { ok: false, error: saveErr.message };
      const outcome = r.success ? 'acts this turn' : 'still STUNNED';
      const chatErr = await insertChatLine(
        supabase,
        sessionId,
        `**${working.name}** — Stun recovery: rolled ${roll} vs ≤${r.target} — ${outcome}.`,
        'roll',
        {
          kind: 'npc_turn_save',
          save: 'stun_recovery',
          characterId: working.id,
          roll,
          target: r.target,
          success: r.success,
        },
      );
      if (chatErr) return { ok: false, error: chatErr.message };
    }

    if (working.damage >= 41) {
      state = {
        ...state,
        activeTurnIndex: (state.activeTurnIndex + 1) % state.entries.length,
        startOfTurnSavesPendingFor: null,
      };
      continue;
    }

    const needsDeath =
      (working.derivedStats?.deathSaveTarget ?? -1) >= 0 &&
      !working.isStabilized &&
      working.damage < 41;

    if (needsDeath) {
      const roll = rollFlatD10();
      const r = npcApplyDeathSave(working, roll);
      working = r.character;
      byId.set(working.id, working);
      const { error: saveErr } = await saveCharacterToSupabase(supabase, working);
      if (saveErr) return { ok: false, error: saveErr.message };
      const died = working.damage >= 41;
      const chatErr = await insertChatLine(
        supabase,
        sessionId,
        `**${working.name}** — Death save: rolled ${roll} vs ≤${r.target} — ${died ? 'DIED' : 'survived'}.`,
        'roll',
        {
          kind: 'npc_turn_save',
          save: 'death',
          characterId: working.id,
          roll,
          target: r.target,
          success: r.success,
        },
      );
      if (chatErr) return { ok: false, error: chatErr.message };
    }

    if (working.damage >= 41) {
      state = {
        ...state,
        activeTurnIndex: (state.activeTurnIndex + 1) % state.entries.length,
        startOfTurnSavesPendingFor: null,
      };
      continue;
    }

    state = { ...state, startOfTurnSavesPendingFor: null };
    break;
  }

  const err = await persistCombatState(supabase, sessionId, state);
  if (err) return { ok: false, error: err.message };
  return { ok: true, combat_state: state };
}

/** Clears `startOfTurnSavesPendingFor` after the owning player resolves PC start-of-turn saves. */
export async function sessionClearStartOfTurnSavesPending(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ ok: true; combat_state: CombatState } | { ok: false; error: string }> {
  const current = await fetchSessionCombatState(supabase, sessionId);
  if (!current) return { ok: false, error: 'No active combat' };
  if (!current.startOfTurnSavesPendingFor) {
    return { ok: false, error: 'No start-of-turn saves pending' };
  }
  const state: CombatState = { ...current };
  delete state.startOfTurnSavesPendingFor;
  const err = await persistCombatState(supabase, sessionId, state);
  if (err) return { ok: false, error: err.message };
  return { ok: true, combat_state: state };
}

export async function sessionAdvanceRound(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ ok: true; combat_state: CombatState } | { ok: false; error: string }> {
  const current = await fetchSessionCombatState(supabase, sessionId);
  if (!current || current.entries.length === 0) {
    return { ok: false, error: 'No active combat' };
  }

  const chars = await loadSessionCharacters(supabase, sessionId);
  const clearedLines: string[] = [];

  for (const c of chars) {
    const { character: ticked, expired } = tickConditionsOneRound(c);
    if (expired.length > 0) {
      for (const ex of expired) {
        clearedLines.push(`${ex.name} cleared from **${ticked.name}**`);
      }
    }
    const condChanged = JSON.stringify(ticked.conditions) !== JSON.stringify(c.conditions);
    if (condChanged) {
      const { error } = await saveCharacterToSupabase(supabase, ticked);
      if (error) return { ok: false, error: error.message };
    }
  }

  const state: CombatState = {
    ...current,
    round: current.round + 1,
    activeTurnIndex: 0,
    startOfTurnSavesPendingFor: null,
  };

  const err = await persistCombatState(supabase, sessionId, state);
  if (err) return { ok: false, error: err.message };

  let line = `— Round **${state.round}** begins —`;
  if (clearedLines.length > 0) {
    line += ` ${clearedLines.join('; ')}.`;
  }
  const chatErr = await insertChatLine(supabase, sessionId, line, 'system', {
    kind: 'combat_advance_round',
    round: state.round,
  });
  if (chatErr) return { ok: false, error: chatErr.message };

  return { ok: true, combat_state: state };
}

export async function sessionEndCombat(
  supabase: SupabaseClient,
  sessionId: string,
  opts?: { clear_timed_conditions?: boolean; narration?: string },
): Promise<{ ok: true; combat_state: null } | { ok: false; error: string }> {
  const err = await persistCombatState(supabase, sessionId, null);
  if (err) return { ok: false, error: err.message };

  if (opts?.clear_timed_conditions) {
    const chars = await loadSessionCharacters(supabase, sessionId);
    for (const c of chars) {
      const next = stripTimedConditions(c);
      if (JSON.stringify(next.conditions) !== JSON.stringify(c.conditions)) {
        const { error } = await saveCharacterToSupabase(supabase, next);
        if (error) return { ok: false, error: error.message };
      }
    }
  }

  const text =
    opts?.narration?.trim() ||
    '*Combat ends — weapons safe, scanners down.*';
  const chatErr = await insertChatLine(supabase, sessionId, text, 'narration', { kind: 'combat_end' });
  if (chatErr) return { ok: false, error: chatErr.message };

  return { ok: true, combat_state: null };
}
