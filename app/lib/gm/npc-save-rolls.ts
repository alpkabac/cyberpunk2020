/**
 * Server-safe NPC stun/death flat d10 resolution (mirrors client store math).
 */

import type { Character } from '../types';
import { isFlatSaveSuccess } from '../game-logic/formulas';
import { recalcCharacterForGm } from './character-mutations';

export function rollFlatD10(): number {
  return Math.floor(Math.random() * 10) + 1;
}

function stunMod(m: Character['combatModifiers'] | undefined): number {
  return m?.stunSave ?? 0;
}

/** Stun + optional death-only bonus (items that buff death saves but not stun). */
function deathMod(m: Character['combatModifiers'] | undefined): number {
  return (m?.stunSave ?? 0) + (m?.deathSave ?? 0);
}

/**
 * Immediately after taking damage: success → not stunned; fail → stunned.
 */
export function npcApplyDamageStunSave(
  character: Character,
  roll: number,
): { character: Character; target: number; success: boolean } {
  const c = recalcCharacterForGm(character);
  if (!c.derivedStats) return { character: c, target: 0, success: true };
  const target = c.derivedStats.stunSaveTarget + stunMod(c.combatModifiers);
  const success = isFlatSaveSuccess(roll, target);
  return {
    character: recalcCharacterForGm({ ...c, isStunned: !success }),
    target,
    success,
  };
}

/**
 * Start of turn while stunned: success → clear stun; fail → stay stunned.
 */
export function npcApplyStunRecoverySave(
  character: Character,
  roll: number,
): { character: Character; target: number; success: boolean } {
  const c = recalcCharacterForGm(character);
  if (!c.derivedStats) return { character: c, target: 0, success: false };
  const target = c.derivedStats.stunSaveTarget + stunMod(c.combatModifiers);
  const success = isFlatSaveSuccess(roll, target);
  return {
    character: recalcCharacterForGm({ ...c, isStunned: success ? false : true }),
    target,
    success,
  };
}

/**
 * Mortal ongoing (or severance) death save: success → unchanged damage; fail → 41.
 * Does not check `isStabilized` — caller skips when stabilized for ongoing saves.
 */
export function npcApplyDeathSave(
  character: Character,
  roll: number,
): { character: Character; target: number; success: boolean } {
  const c = recalcCharacterForGm(character);
  if (!c.derivedStats || c.derivedStats.deathSaveTarget < 0) {
    return { character: c, target: -1, success: true };
  }
  const target = c.derivedStats.deathSaveTarget + deathMod(c.combatModifiers);
  const success = isFlatSaveSuccess(roll, target);
  const next = success ? c : { ...c, damage: 41 };
  return {
    character: recalcCharacterForGm(next),
    target,
    success,
  };
}
