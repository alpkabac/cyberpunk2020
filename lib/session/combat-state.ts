/**
 * Initiative / combat tracker JSON (sessions.combat_state).
 */

import { recalcCharacterForGm } from '../gm/character-mutations';
import { rollDice } from '../game-logic/dice';
import type { Character, CombatState, Cyberware, InitiativeEntry } from '../types';
import { cyberwareInitiativeBonusFromSheet } from '../game-logic/cyberware-initiative-resolve';

const STATE_VERSION = 1;

export function combatSenseBonus(character: Character): number {
  return character.specialAbility?.name === 'Combat Sense' ? character.specialAbility.value : 0;
}

/** Sum initiative-only bonus from equipped cyberware (sheet field + compendium backfill by name). */
export function sumEquippedCyberwareInitiativeBonus(character: Character): number {
  let s = 0;
  for (const item of character.items) {
    if (item.type !== 'cyberware' || !item.equipped) continue;
    s += cyberwareInitiativeBonusFromSheet(item as Cyberware);
  }
  return s;
}

/** d10 detail string from rollDice result (single exploding chain). */
function d10DetailFromRoll(rolls: number[]): string {
  if (rolls.length === 0) return '?';
  if (rolls.length === 1) return String(rolls[0]);
  return rolls.map(String).join('+');
}

export function rollInitiativeEntry(character: Character): InitiativeEntry {
  const prepared = recalcCharacterForGm({ ...character });
  const ref = prepared.stats.ref.total || 0;
  const initiativeMod = prepared.combatModifiers?.initiative ?? 0;
  const combatSense = combatSenseBonus(prepared);
  const cyberInitiativeBonus = sumEquippedCyberwareInitiativeBonus(prepared);
  const rolled = rollDice('1d10');
  const d10Total = rolled?.total ?? 1;
  const d10Detail = rolled?.rolls?.length ? d10DetailFromRoll(rolled.rolls) : String(d10Total);
  const total = ref + initiativeMod + combatSense + cyberInitiativeBonus + d10Total;
  return {
    characterId: prepared.id,
    name: prepared.name,
    ref,
    initiativeMod,
    combatSense,
    cyberInitiativeBonus,
    d10Total,
    d10Detail,
    total,
  };
}

export function sortInitiativeEntries(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
}

export function parseCombatStateJson(v: unknown): CombatState | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.version !== undefined && Number(o.version) !== STATE_VERSION) return null;
  if (typeof o.round !== 'number' || !Number.isFinite(o.round) || o.round < 1) return null;
  if (typeof o.activeTurnIndex !== 'number' || !Number.isInteger(o.activeTurnIndex) || o.activeTurnIndex < 0) {
    return null;
  }
  if (!Array.isArray(o.entries)) return null;

  const entries: InitiativeEntry[] = [];
  for (const raw of o.entries) {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.characterId !== 'string' || !e.characterId) return null;
    if (typeof e.name !== 'string') return null;
    if (typeof e.ref !== 'number' || !Number.isFinite(e.ref)) return null;
    if (typeof e.initiativeMod !== 'number' || !Number.isFinite(e.initiativeMod)) return null;
    if (typeof e.combatSense !== 'number' || !Number.isFinite(e.combatSense)) return null;
    const cyberInitiativeBonus =
      typeof e.cyberInitiativeBonus === 'number' && Number.isFinite(e.cyberInitiativeBonus)
        ? e.cyberInitiativeBonus
        : 0;
    if (typeof e.d10Total !== 'number' || !Number.isFinite(e.d10Total)) return null;
    if (typeof e.d10Detail !== 'string') return null;
    if (typeof e.total !== 'number' || !Number.isFinite(e.total)) return null;
    entries.push({
      characterId: e.characterId,
      name: e.name,
      ref: e.ref,
      initiativeMod: e.initiativeMod,
      combatSense: e.combatSense,
      cyberInitiativeBonus,
      d10Total: e.d10Total,
      d10Detail: e.d10Detail,
      total: e.total,
    });
  }

  const activeTurnIndex =
    entries.length === 0 ? 0 : Math.min(o.activeTurnIndex as number, entries.length - 1);

  const pendingRaw = o.startOfTurnSavesPendingFor;
  const startOfTurnSavesPendingFor =
    typeof pendingRaw === 'string' && pendingRaw.trim() !== '' ? pendingRaw.trim() : null;

  const base: CombatState = {
    round: Math.floor(o.round),
    activeTurnIndex,
    entries,
  };
  return startOfTurnSavesPendingFor ? { ...base, startOfTurnSavesPendingFor } : base;
}

export function combatStateToJson(state: CombatState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    version: STATE_VERSION,
    round: state.round,
    activeTurnIndex: state.activeTurnIndex,
    entries: state.entries.map((e) => ({ ...e })),
  };
  if (state.startOfTurnSavesPendingFor) {
    out.startOfTurnSavesPendingFor = state.startOfTurnSavesPendingFor;
  }
  return out;
}

export function getActiveCombatCharacterId(state: CombatState | null | undefined): string | null {
  if (!state || state.entries.length === 0) return null;
  const idx = Math.max(0, Math.min(state.activeTurnIndex, state.entries.length - 1));
  return state.entries[idx]?.characterId ?? null;
}
