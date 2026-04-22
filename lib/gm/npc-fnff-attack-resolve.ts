/**
 * Server-side FNFF resolution for NPC attacks — one tool call: range check, to-hit,
 * damage, armor pipeline, ammo, multi-action count, chat lines.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character, Weapon, Zone } from '../types';
import { saveCharacterToSupabase } from '../db/character-serialize';
import {
  applyGmDamageDetailed,
  applyGmUpdateAmmo,
  recalcCharacterForGm,
} from './character-mutations';
import { npcApplyDamageStunSave, npcApplyDeathSave, rollFlatD10 } from './npc-save-rolls';
import { rollDice } from '../game-logic/dice';
import {
  fnffAttackTotalMeetsDv,
  getRangeBracket,
  rangeBrackets,
  rollFnffHitLocation,
  type RangeBracket,
} from '../game-logic/lookups';
import {
  burstAllowedAtBracket,
  burstAmmo,
  burstHitCountFromD6,
  fullAutoHitCount,
  fullAutoRoundsPerTarget,
  fullAutoToHitModifier,
  type AutoWeaponRangeBracket,
} from '../game-logic/fire-modes';
import { resolveAttackFumbleOutcome } from '../game-logic/fumbles';
import { multiActionRollPenalty } from '../game-logic/multi-action-penalty';
import {
  MAP_GRID_DEFAULT_COLS,
  MAP_GRID_DEFAULT_ROWS,
  normalizeGridDimension,
  pctToCell,
} from '../map/grid';
import { fetchSessionSettings } from '../session/fetch-session-settings';
import { getActiveCombatCharacterId, parseCombatStateJson } from '../session/combat-state';
import { sessionMaybeAutoEndCombatWhenAllDown, sessionRecordCombatAction } from '../session/session-combat-service';
import type { ToolExecutorContext } from './tool-executor';

const RANGE_BRACKET_IDS = new Set<string>(['PointBlank', 'Close', 'Medium', 'Long', 'Extreme']);

function parseRangeBracketOverride(v: unknown): RangeBracket | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return null;
  return RANGE_BRACKET_IDS.has(v) ? (v as RangeBracket) : null;
}

export type NpcFnffAttackKind = 'melee' | 'semi' | 'burst' | 'full_auto';

function attackSkillTotal(character: Character, weapon: Weapon): number {
  const skill = character.skills.find(
    (s) => s.name.toLowerCase() === weapon.attackSkill?.toLowerCase(),
  );
  const skillVal = skill?.value ?? 0;
  const refTotal = character.stats.ref.total || 0;
  return refTotal + skillVal + (weapon.accuracy || 0);
}

function chebyshevCells(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cols: number,
  rows: number,
): number {
  const a = pctToCell(x1, y1, cols, rows);
  const b = pctToCell(x2, y2, cols, rows);
  return Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
}

function metersBetweenTokens(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cols: number,
  rows: number,
  metersPerSquare: number,
): number {
  const a = pctToCell(ax, ay, cols, rows);
  const b = pctToCell(bx, by, cols, rows);
  const dc = b.c - a.c;
  const dr = b.r - a.r;
  const cells = Math.sqrt(dc * dc + dr * dr);
  return cells * metersPerSquare;
}

async function fetchCombatState(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase.from('sessions').select('combat_state').eq('id', sessionId).maybeSingle();
  if (error || !data) return null;
  return parseCombatStateJson((data as { combat_state?: unknown }).combat_state);
}

type TokenRow = { character_id: string | null; x: number; y: number };

async function fetchSessionTokens(supabase: SupabaseClient, sessionId: string): Promise<TokenRow[]> {
  const { data, error } = await supabase
    .from('tokens')
    .select('character_id, x, y')
    .eq('session_id', sessionId);
  if (error || !data) return [];
  return (data as TokenRow[]).map((t) => ({
    character_id: typeof t.character_id === 'string' ? t.character_id : null,
    x: Number(t.x),
    y: Number(t.y),
  }));
}

function tokenForCharacter(tokens: TokenRow[], characterId: string): TokenRow | null {
  return tokens.find((t) => t.character_id === characterId) ?? null;
}

async function persistAndNpcSaves(
  ctx: ToolExecutorContext,
  victimId: string,
  working: Character,
  info: ReturnType<typeof applyGmDamageDetailed>['info'],
): Promise<{ ok: true } | { ok: false; error: string }> {
  ctx.charactersById.set(victimId, working);
  const { error } = await saveCharacterToSupabase(ctx.supabase, working);
  if (error) return { ok: false, error: error.message };

  if (working.type === 'npc' && info.stunSaveRequired) {
    const roll = rollFlatD10();
    const r = npcApplyDamageStunSave(working, roll);
    working = r.character;
    ctx.charactersById.set(victimId, working);
    const e2 = await saveCharacterToSupabase(ctx.supabase, working);
    if (e2.error) return { ok: false, error: e2.error.message };
  }

  if (working.type === 'npc' && info.limbSevered && working.damage < 41) {
    const roll = rollFlatD10();
    const r = npcApplyDeathSave(working, roll);
    working = r.character;
    ctx.charactersById.set(victimId, working);
    const e3 = await saveCharacterToSupabase(ctx.supabase, working);
    if (e3.error) return { ok: false, error: e3.error.message };
  }

  return { ok: true };
}

export async function runNpcFnffAttackResolution(input: {
  ctx: ToolExecutorContext;
  attackerCharacterId: string;
  weaponId: string;
  attackKind: NpcFnffAttackKind;
  targets: Array<{ target_character_id: string }>;
  rangedModifierTotal?: number | null;
  /** PointBlank | Close | Medium | Long | Extreme — skips token distance when set. */
  rangeBracketOverride?: unknown;
  reason?: string;
}): Promise<
  | { ok: true; chatLines: string[]; result: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const { ctx, attackerCharacterId, weaponId, attackKind, reason } = input;
  const targets = input.targets ?? [];
  const modExtra =
    input.rangedModifierTotal !== undefined && input.rangedModifierTotal !== null
      ? Number(input.rangedModifierTotal)
      : 0;
  const modSum = Number.isFinite(modExtra) ? modExtra : 0;

  const rawAttacker = ctx.charactersById.get(attackerCharacterId);
  if (!rawAttacker) return { ok: false, error: `Attacker not in session: ${attackerCharacterId}` };
  if (rawAttacker.type !== 'npc') {
    return { ok: false, error: 'npc_resolve_fnff_attack is only for NPC attackers' };
  }

  const attacker = recalcCharacterForGm({ ...rawAttacker });
  const weapon = attacker.items.find((i): i is Weapon => i.type === 'weapon' && i.id === weaponId);
  if (!weapon) return { ok: false, error: `Weapon not on sheet: ${weaponId}` };

  const combatState = await fetchCombatState(ctx.supabase, ctx.sessionId);
  if (!combatState?.entries.length) {
    return { ok: false, error: 'Not in initiative combat — start combat first' };
  }
  const active = getActiveCombatCharacterId(combatState);
  if (active !== attackerCharacterId) {
    return { ok: false, error: 'Only the active initiative combatant can resolve this attack' };
  }

  const actionsThisTurn = combatState.actionsThisTurn ?? 0;
  const multiPen = multiActionRollPenalty(actionsThisTurn);

  const settings = await fetchSessionSettings(ctx.supabase, ctx.sessionId);
  const cols = normalizeGridDimension(settings.mapGridCols, MAP_GRID_DEFAULT_COLS);
  const rows = normalizeGridDimension(settings.mapGridRows, MAP_GRID_DEFAULT_ROWS);
  const mps = settings.mapMetersPerSquare;
  const tokens = await fetchSessionTokens(ctx.supabase, ctx.sessionId);
  const atkTok = tokenForCharacter(tokens, attackerCharacterId);

  const lines: string[] = [];
  const hitsOut: Array<Record<string, unknown>> = [];
  const reasonSuffix = reason?.trim() ? ` — ${reason.trim()}` : '';

  const skillBase = attackSkillTotal(attacker, weapon);
  const dmgFormula = weapon.damage?.trim() || '1d6';
  const isAp = !!weapon.ap;
  const rof = Math.max(0, Math.floor(weapon.rof ?? 0));
  const wRange = Number(weapon.range);
  const isMeleeW = weapon.weaponType === 'Melee';
  const canAuto = weapon.isAutoCapable || weapon.attackType === 'Auto';
  const magCap = Math.max(0, Math.floor(weapon.shots ?? 0));
  const bracketOverride = parseRangeBracketOverride(input.rangeBracketOverride);

  /** Subtract ammo from the latest attacker row in ctx (call after other mutations). */
  const commitAmmo = async (roundsSpent: number): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (roundsSpent <= 0) return { ok: true };
    const curChar = ctx.charactersById.get(attackerCharacterId);
    if (!curChar) return { ok: false, error: 'Attacker missing during ammo update' };
    const cur = curChar.items.find((i) => i.id === weaponId && i.type === 'weapon') as Weapon | undefined;
    if (!cur) return { ok: false, error: 'Weapon missing during ammo update' };
    if (magCap <= 0) return { ok: true };
    const next = Math.max(0, cur.shotsLeft - roundsSpent);
    const updated = applyGmUpdateAmmo(curChar, weaponId, next, false);
    if (!updated) return { ok: false, error: 'Ammo update failed' };
    ctx.charactersById.set(attackerCharacterId, updated);
    const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const applyOneHit = async (
    victimId: string,
    rawDamage: number,
    zone: Zone | null,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const vic = ctx.charactersById.get(victimId);
    if (!vic) return { ok: false, error: `Target not in session: ${victimId}` };
    const { character: updated, info } = applyGmDamageDetailed(
      recalcCharacterForGm({ ...vic }),
      rawDamage,
      zone,
      isAp,
      false,
      dmgFormula,
    );
    return persistAndNpcSaves(ctx, victimId, updated, info);
  };

  if (attackKind === 'melee') {
    if (!isMeleeW) return { ok: false, error: 'Melee attack_kind requires a melee weapon' };
    if (targets.length !== 1) return { ok: false, error: 'Melee requires exactly one target' };
    const tid = targets[0]!.target_character_id;
    const vicTok = tokenForCharacter(tokens, tid);
    if (!atkTok || !vicTok) {
      return {
        ok: false,
        error:
          'Melee range: place both attacker and target tokens on the map (or use semi/burst with range_bracket_override for theater-of-mind).',
      };
    }
    if (chebyshevCells(atkTok.x, atkTok.y, vicTok.x, vicTok.y, cols, rows) > 1) {
      return { ok: false, error: 'Target is not in melee reach (adjacent cell or same cell on the grid)' };
    }

    const dv = rangeBrackets.PointBlank.dc;
    const staticBonus = skillBase + modSum + multiPen;
    const atk = rollDice(`1d10+${staticBonus}`);
    if (!atk) return { ok: false, error: 'Attack roll failed' };

    lines.push(
      `**${attacker.name}** melee (${weapon.name})${reasonSuffix}: 1d10+${staticBonus} → **${atk.total}** vs DV ${dv} ${fnffAttackTotalMeetsDv(atk.total, dv) ? 'HIT' : 'MISS'}`,
    );

    if (atk.firstD10Face === 1) {
      const f = resolveAttackFumbleOutcome(true, weapon.reliability);
      lines.push(`Natural 1: ${f.lines.join(' ')}`);
    }
    const miss = !fnffAttackTotalMeetsDv(atk.total, dv) || atk.firstD10Face === 1;
    if (!miss) {
      const loc = rollFnffHitLocation();
      const zone = loc.zone;
      const dmg = rollDice(dmgFormula);
      const amt = dmg?.total ?? 0;
      lines.push(`  Hit: loc d10=${loc.d10} → ${zone ?? '?'}, ${dmgFormula} → **${amt}**`);
      const ap = await applyOneHit(tid, amt, zone);
      if (!ap.ok) return ap;
      hitsOut.push({ target_character_id: tid, zone, raw_damage: amt, total: atk.total });
    }

    const am = await commitAmmo(magCap > 0 ? 1 : 0);
    if (!am.ok) return am;

    const rec = await sessionRecordCombatAction(ctx.supabase, ctx.sessionId, attackerCharacterId);
    if (!rec.ok) return { ok: false, error: rec.error };

    const end = await sessionMaybeAutoEndCombatWhenAllDown(ctx.supabase, ctx.sessionId);
    if (!end.ok) return { ok: false, error: end.error };

    return {
      ok: true,
      chatLines: lines,
      result: {
        attack_kind: 'melee',
        attacker_character_id: attackerCharacterId,
        weapon_id: weaponId,
        multi_action_penalty_applied: multiPen,
        hits: hitsOut,
        miss,
      },
    };
  }

  if (isMeleeW) {
    return { ok: false, error: 'Use attack_kind melee for melee weapons' };
  }

  if (!Number.isFinite(wRange) || wRange <= 0) {
    return { ok: false, error: 'Weapon has no valid range (m) — fix the sheet' };
  }

  if (attackKind === 'burst' || attackKind === 'full_auto') {
    if (!canAuto) return { ok: false, error: 'Burst/full auto require an auto-capable weapon' };
  }

  if (attackKind === 'burst' && targets.length !== 1) {
    return { ok: false, error: 'Burst uses exactly one target' };
  }
  if (attackKind === 'semi' && targets.length !== 1) {
    return { ok: false, error: 'Semi-auto uses exactly one target' };
  }
  if (attackKind === 'full_auto' && targets.length < 1) {
    return { ok: false, error: 'Full auto needs at least one target' };
  }

  const resolveBracket = (targetId: string): { ok: true; bracket: RangeBracket } | { ok: false; error: string } => {
    if (bracketOverride) {
      return { ok: true, bracket: bracketOverride };
    }
    const vt = tokenForCharacter(tokens, targetId);
    if (!atkTok || !vt) {
      return {
        ok: false,
        error:
          'Could not resolve range: tokens missing for attacker/target, or pass range_bracket_override (PointBlank|Close|Medium|Long|Extreme)',
      };
    }
    if (!Number.isFinite(mps) || mps <= 0) {
      return {
        ok: false,
        error: 'Set map meters per square in session settings, or pass range_bracket_override',
      };
    }
    const meters = metersBetweenTokens(atkTok.x, atkTok.y, vt.x, vt.y, cols, rows, mps);
    return { ok: true, bracket: getRangeBracket(meters, wRange) };
  };

  if (attackKind === 'semi') {
    const tid = targets[0]!.target_character_id;
    const br = resolveBracket(tid);
    if (!br.ok) return br;
    const bracket = br.bracket;
    const dv = rangeBrackets[bracket].dc;
    const staticBonus = skillBase + modSum + multiPen;
    const atk = rollDice(`1d10+${staticBonus}`);
    if (!atk) return { ok: false, error: 'Attack roll failed' };

    lines.push(
      `**${attacker.name}** semi (${weapon.name}, ${rangeBrackets[bracket].label}, DV ${dv})${reasonSuffix}: 1d10+${staticBonus} → **${atk.total}** ${fnffAttackTotalMeetsDv(atk.total, dv) ? 'HIT' : 'MISS'}`,
    );

    if (atk.firstD10Face === 1) {
      const f = resolveAttackFumbleOutcome(false, weapon.reliability);
      lines.push(`Natural 1: ${f.lines.join(' ')}`);
    }
    const miss = !fnffAttackTotalMeetsDv(atk.total, dv) || atk.firstD10Face === 1;
    if (!miss) {
      const loc = rollFnffHitLocation();
      const zone = loc.zone;
      const dmg = rollDice(dmgFormula);
      const amt = dmg?.total ?? 0;
      lines.push(`  Damage: loc d10=${loc.d10} → ${zone ?? '?'}, ${dmgFormula} → **${amt}**`);
      const ap = await applyOneHit(tid, amt, zone);
      if (!ap.ok) return ap;
      hitsOut.push({ target_character_id: tid, zone, raw_damage: amt });
    }

    const am = await commitAmmo(magCap > 0 ? 1 : 0);
    if (!am.ok) return am;

    const rec = await sessionRecordCombatAction(ctx.supabase, ctx.sessionId, attackerCharacterId);
    if (!rec.ok) return { ok: false, error: rec.error };
    const end = await sessionMaybeAutoEndCombatWhenAllDown(ctx.supabase, ctx.sessionId);
    if (!end.ok) return { ok: false, error: end.error };

    return {
      ok: true,
      chatLines: lines,
      result: {
        attack_kind: 'semi',
        bracket,
        multi_action_penalty_applied: multiPen,
        hits: hitsOut,
        miss,
      },
    };
  }

  if (attackKind === 'burst') {
    const tid = targets[0]!.target_character_id;
    const br = resolveBracket(tid);
    if (!br.ok) return br;
    const bracket = br.bracket as AutoWeaponRangeBracket;
    if (!burstAllowedAtBracket(bracket)) {
      return { ok: false, error: '3-round burst only at Close or Medium range' };
    }
    const need = burstAmmo(rof);
    const atkFresh = ctx.charactersById.get(attackerCharacterId);
    const curW = atkFresh?.items.find((i) => i.id === weaponId && i.type === 'weapon') as Weapon | undefined;
    if (!curW) return { ok: false, error: 'Weapon not found for burst' };
    if (curW.shotsLeft < need) {
      return { ok: false, error: `Not enough ammo for burst (need ${need}, have ${curW.shotsLeft})` };
    }

    const dv = rangeBrackets[bracket].dc;
    const staticBonus = skillBase + modSum + 3 + multiPen;
    const atk = rollDice(`1d10+${staticBonus}`);
    if (!atk) return { ok: false, error: 'Attack roll failed' };

    lines.push(
      `**${attacker.name}** 3-round burst (${weapon.name}, ${rangeBrackets[bracket].label}, DV ${dv})${reasonSuffix}: 1d10+${staticBonus} → **${atk.total}** ${fnffAttackTotalMeetsDv(atk.total, dv) ? 'HIT' : 'MISS'}`,
    );

    if (atk.firstD10Face === 1) {
      const f = resolveAttackFumbleOutcome(false, weapon.reliability);
      lines.push(`Natural 1: ${f.lines.join(' ')}`);
    }
    const miss = !fnffAttackTotalMeetsDv(atk.total, dv) || atk.firstD10Face === 1;
    if (miss) {
      const am = await commitAmmo(need);
      if (!am.ok) return am;
      const rec = await sessionRecordCombatAction(ctx.supabase, ctx.sessionId, attackerCharacterId);
      if (!rec.ok) return { ok: false, error: rec.error };
      const end = await sessionMaybeAutoEndCombatWhenAllDown(ctx.supabase, ctx.sessionId);
      if (!end.ok) return { ok: false, error: end.error };
      return {
        ok: true,
        chatLines: lines,
        result: { attack_kind: 'burst', multi_action_penalty_applied: multiPen, hits: [], miss: true },
      };
    }

    const d6 = rollDice('flat:1d6');
    const nHits = d6 ? burstHitCountFromD6(d6.rolls[0] ?? 1) : 0;
    lines.push(`Burst hits: 1d6=${d6?.rolls[0] ?? '?'} → **${nHits}** hit(s).`);

    for (let i = 0; i < nHits; i++) {
      const loc = rollFnffHitLocation();
      const zone = loc.zone;
      const dmg = rollDice(dmgFormula);
      const amt = dmg?.total ?? 0;
      lines.push(`  Hit ${i + 1}: loc d10=${loc.d10} → ${zone ?? '?'}, ${dmgFormula} → **${amt}**`);
      const ap = await applyOneHit(tid, amt, zone);
      if (!ap.ok) return ap;
      hitsOut.push({ target_character_id: tid, hit_index: i + 1, zone, raw_damage: amt });
    }

    const am = await commitAmmo(need);
    if (!am.ok) return am;
    const rec = await sessionRecordCombatAction(ctx.supabase, ctx.sessionId, attackerCharacterId);
    if (!rec.ok) return { ok: false, error: rec.error };
    const end = await sessionMaybeAutoEndCombatWhenAllDown(ctx.supabase, ctx.sessionId);
    if (!end.ok) return { ok: false, error: end.error };

    return {
      ok: true,
      chatLines: lines,
      result: {
        attack_kind: 'burst',
        bracket,
        multi_action_penalty_applied: multiPen,
        hits: hitsOut,
        miss: false,
      },
    };
  }

  if (attackKind === 'full_auto') {
    const n = targets.length;
    const rpt = fullAutoRoundsPerTarget(rof, n);
    if (rpt < 1) {
      return { ok: false, error: 'ROF too low for full-auto spread across targets' };
    }
    const atk0 = ctx.charactersById.get(attackerCharacterId);
    const w0 = atk0?.items.find((i) => i.id === weaponId && i.type === 'weapon') as Weapon | undefined;
    if (!w0) return { ok: false, error: 'Weapon not found for full auto' };
    if (w0.shotsLeft < rof) {
      return { ok: false, error: `Not enough ammo for full auto (need ${rof}, have ${w0.shotsLeft})` };
    }

    for (const t of targets) {
      const tid = t.target_character_id;
      const br = resolveBracket(tid);
      if (!br.ok) return br;
      const bracket = br.bracket as AutoWeaponRangeBracket;
      const dv = rangeBrackets[bracket].dc;
      const faMod = fullAutoToHitModifier(rpt, bracket);
      const staticBonus = skillBase + modSum + faMod + multiPen;
      const atk = rollDice(`1d10+${staticBonus}`);
      if (!atk) {
        lines.push(`vs target ${tid}: (roll error)`);
        continue;
      }

      lines.push(
        `**${attacker.name}** full auto vs **${tid}** (${rangeBrackets[bracket].label}, DV ${dv}, ${rpt} rds): 1d10+${staticBonus} → **${atk.total}**`,
      );

      if (atk.firstD10Face === 1) {
        const f = resolveAttackFumbleOutcome(false, weapon.reliability);
        lines.push(`  Natural 1: ${f.lines.join(' ')}`);
      }

      if (!fnffAttackTotalMeetsDv(atk.total, dv) || atk.firstD10Face === 1) {
        lines.push(`  MISS`);
        continue;
      }

      const nh = fullAutoHitCount(atk.total, dv, rpt);
      lines.push(`  Rounds that hit: **${nh}**`);
      for (let i = 0; i < nh; i++) {
        const loc = rollFnffHitLocation();
        const zone = loc.zone;
        const dmg = rollDice(dmgFormula);
        const amt = dmg?.total ?? 0;
        lines.push(`    Hit ${i + 1}: loc → ${zone ?? '?'}, ${dmgFormula} → **${amt}**`);
        const ap = await applyOneHit(tid, amt, zone);
        if (!ap.ok) return ap;
        hitsOut.push({ target_character_id: tid, hit_index: i + 1, zone, raw_damage: amt });
      }
    }

    const am = await commitAmmo(rof);
    if (!am.ok) return am;
    const rec = await sessionRecordCombatAction(ctx.supabase, ctx.sessionId, attackerCharacterId);
    if (!rec.ok) return { ok: false, error: rec.error };
    const end = await sessionMaybeAutoEndCombatWhenAllDown(ctx.supabase, ctx.sessionId);
    if (!end.ok) return { ok: false, error: end.error };

    return {
      ok: true,
      chatLines: lines,
      result: {
        attack_kind: 'full_auto',
        multi_action_penalty_applied: multiPen,
        hits: hitsOut,
        miss: hitsOut.length === 0,
      },
    };
  }

  return { ok: false, error: 'Unsupported attack_kind' };
}
