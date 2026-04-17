/**
 * Client-side burst / full-auto resolution: attack roll(s), then hits → location + damage + applyDamage.
 */

import type { Weapon, Zone } from '../types';
import { useGameStore } from '@/lib/store/game-store';
import { rollDice } from './dice';
import {
  fnffAttackTotalMeetsDv,
  rangeBrackets,
  rollFnffHitLocation,
  rangedCombatModifiers,
} from './lookups';
import type { RangeBracket } from './lookups';
import { resolveAttackFumbleOutcome } from './fumbles';
import {
  burstHitCountFromD6,
  fullAutoHitCount,
  fullAutoRoundsPerTarget,
  fullAutoToHitModifier,
  stripAutofireIncompatibleMods,
} from './fire-modes';

export type AutomatedFireTarget = {
  characterId: string;
  name: string;
  bracket: RangeBracket;
};

function newChatId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function postRollLine(speaker: string, text: string): void {
  useGameStore.getState().addChatMessage({
    id: newChatId(),
    speaker,
    text,
    timestamp: Date.now(),
    type: 'roll',
  });
}

export function computeAutofireModStrip(
  toggles: Record<string, boolean> | undefined,
): number {
  return stripAutofireIncompatibleMods(toggles, rangedCombatModifiers as Record<string, number>);
}

function applyHit(
  victimId: string,
  rawDamage: number,
  zone: Zone | null,
  isAp: boolean,
  weaponDamageFormula: string,
  cover: { stackedSp: number; regionIds: string[] } | null,
): void {
  useGameStore.getState().applyDamage(
    victimId,
    rawDamage,
    zone,
    isAp,
    false,
    weaponDamageFormula,
    cover,
  );
}

export function runAutomatedWeaponFire(input: {
  shooterName: string;
  weapon: Weapon;
  mode: 'ThreeRoundBurst' | 'FullAuto';
  /** REF + skill + WA */
  attackSkillTotal: number;
  /** Per-target situational modifiers (cover, movement, etc.). Incompatible aim/scope toggles already omitted or use modStrip on top — see below. */
  situationalModSumByTarget: (targetId: string) => number;
  /** Extra delta from stripping incompatible checklist toggles (typically negative). */
  modStrip: number;
  targets: AutomatedFireTarget[];
  /** Map cover for damage pipeline (per victim). */
  coverByTargetId: Record<string, { stackedSp: number; regionIds: string[] } | undefined>;
}): void {
  const {
    shooterName,
    weapon,
    mode,
    attackSkillTotal,
    situationalModSumByTarget,
    modStrip,
    targets,
    coverByTargetId,
  } = input;

  if (weapon.weaponType === 'Melee' || targets.length === 0) return;

  const dmgFormula = weapon.damage?.trim() || '1d6';
  const isAp = !!weapon.ap;
  const lines: string[] = [
    `**${weapon.name}** · ${mode === 'ThreeRoundBurst' ? '3-round burst' : 'Full auto'} · ${targets.length} target${targets.length === 1 ? '' : 's'}`,
  ];

  if (mode === 'ThreeRoundBurst') {
    const t = targets[0];
    const dv = rangeBrackets[t.bracket].dc;
    const sit = situationalModSumByTarget(t.characterId) + modStrip;
    const staticBonus = attackSkillTotal + sit + 3;
    const atk = rollDice(`1d10+${staticBonus}`);
    if (!atk) {
      postRollLine(shooterName, lines.join('\n') + '\n(roll error)');
      return;
    }
    const hit = fnffAttackTotalMeetsDv(atk.total, dv);
    lines.push(
      `vs **${t.name}** (${rangeBrackets[t.bracket].label}, DV ${dv}): 1d10+${staticBonus} → **${atk.total}** ${hit ? 'HIT' : 'MISS'}`,
    );

    if (atk.firstD10Face === 1) {
      const f = resolveAttackFumbleOutcome(false, weapon.reliability);
      lines.push(`Natural 1: ${f.lines.join(' ')}`);
    }

    // FNFF: resolve jam / mishap on natural 1 even if modifiers push total ≥ DV.
    if (!hit || atk.firstD10Face === 1) {
      postRollLine(shooterName, lines.join('\n'));
      return;
    }

    const d6 = rollDice('flat:1d6');
    const nHits = d6 ? burstHitCountFromD6(d6.rolls[0] ?? 1) : 0;
    lines.push(`Burst hits: 1d6=${d6?.rolls[0] ?? '?'} → **${nHits}** hit(s) (⌊d6/2⌋).`);

    const cover = coverByTargetId[t.characterId] ?? null;
    for (let i = 0; i < nHits; i++) {
      const loc = rollFnffHitLocation();
      const zone = loc.zone;
      const dmg = rollDice(dmgFormula);
      const amt = dmg?.total ?? 0;
      lines.push(`  Hit ${i + 1}: loc d10=${loc.d10} → ${zone ?? '?'}, damage ${dmgFormula} → **${amt}**`);
      applyHit(t.characterId, amt, zone, isAp, dmgFormula, cover);
    }

    postRollLine(shooterName, lines.join('\n'));
    return;
  }

  // Full auto: one roll per target
  const n = targets.length;
  const rpt = fullAutoRoundsPerTarget(weapon.rof, n);

  for (const t of targets) {
    const dv = rangeBrackets[t.bracket].dc;
    const faMod = fullAutoToHitModifier(rpt, t.bracket);
    const sit = situationalModSumByTarget(t.characterId) + modStrip;
    const staticBonus = attackSkillTotal + sit + faMod;
    const atk = rollDice(`1d10+${staticBonus}`);
    if (!atk) {
      lines.push(`vs **${t.name}**: (roll error)`);
      continue;
    }
    const hit = fnffAttackTotalMeetsDv(atk.total, dv);
    lines.push(
      `vs **${t.name}** (${rangeBrackets[t.bracket].label}, DV ${dv}, ${rpt} rds): FA ${faMod >= 0 ? '+' : ''}${faMod} · 1d10+${staticBonus} → **${atk.total}** ${hit ? 'HIT' : 'MISS'}`,
    );

    if (atk.firstD10Face === 1) {
      const f = resolveAttackFumbleOutcome(false, weapon.reliability);
      lines.push(`  Natural 1: ${f.lines.join(' ')}`);
    }

    if (!hit || atk.firstD10Face === 1) continue;

    const hits = fullAutoHitCount(atk.total, dv, rpt);
    lines.push(`  Rounds that hit: **${hits}** (margin capped at ${rpt}).`);
    const cover = coverByTargetId[t.characterId] ?? null;
    for (let i = 0; i < hits; i++) {
      const loc = rollFnffHitLocation();
      const zone = loc.zone;
      const dmg = rollDice(dmgFormula);
      const amt = dmg?.total ?? 0;
      lines.push(`    Hit ${i + 1}: loc d10=${loc.d10} → ${zone ?? '?'}, ${dmgFormula} → **${amt}**`);
      applyHit(t.characterId, amt, zone, isAp, dmgFormula, cover);
    }
  }

  postRollLine(shooterName, lines.join('\n'));
}
