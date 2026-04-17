/**
 * CP2020 automatic fire: burst, full auto (suppressive placement is separate).
 */

import type { FireMode } from '../types';

/** Same values as `RangeBracket` in lookups (duplicated to avoid import cycles). */
export type AutoWeaponRangeBracket =
  | 'PointBlank'
  | 'Close'
  | 'Medium'
  | 'Long'
  | 'Extreme';

/** Ranged checklist keys that cannot stack with burst / full auto (no aim / optics / smart). */
export const AUTOFIRE_INCOMPATIBLE_RANGED_MOD_LABELS: readonly string[] = [
  'Aiming (1 round)',
  'Aiming (2 rounds)',
  'Aiming (3 rounds, max)',
  'Aimed shot (specific area)',
  'Telescopic Sight',
  'Targeting scope',
  'Laser Sight',
  'Smartgun',
  'Smartgoggles',
];

/** Burst is only valid at Close and Medium (FNFF modifier table + burst section). */
export function burstAllowedAtBracket(bracket: AutoWeaponRangeBracket): boolean {
  return bracket === 'Close' || bracket === 'Medium';
}

/** Rounds spent on burst: min(3, ROF); table rule for ROF 2 pistols = 2 rounds. */
export function burstAmmo(rof: number): number {
  const r = Math.max(0, Math.floor(rof));
  if (r <= 0) return 0;
  return Math.min(3, r);
}

/** Rounds allocated to each target on full auto (ROF ÷ targets, round down). */
export function fullAutoRoundsPerTarget(rof: number, targetCount: number): number {
  const n = Math.max(1, Math.floor(targetCount));
  const r = Math.max(0, Math.floor(rof));
  return Math.floor(r / n);
}

/**
 * Full-auto to-hit modifier from rounds fired at this target/band:
 * Close: +1 per 10 rounds; Medium/Long/Extreme: −1 per 10 rounds.
 */
export function fullAutoToHitModifier(roundsThisTarget: number, bracket: AutoWeaponRangeBracket): number {
  const x = Math.max(0, Math.floor(roundsThisTarget));
  const blocks = Math.floor(x / 10);
  if (bracket === 'Close' || bracket === 'PointBlank') return blocks;
  if (blocks === 0) return 0;
  return -blocks;
}

/** Hits on a full-auto attack: margin over DV, capped by rounds for this target. */
export function fullAutoHitCount(attackTotal: number, dv: number, roundsThisTarget: number): number {
  if (attackTotal < dv) return 0;
  const margin = attackTotal - dv;
  return Math.min(margin, Math.max(0, Math.floor(roundsThisTarget)));
}

/** After a successful burst: floor(d6 / 2) hits, 0–3. */
export function burstHitCountFromD6(d6: number): number {
  const d = Math.max(1, Math.min(6, Math.floor(d6)));
  return Math.floor(d / 2);
}

/**
 * Ammo consumed (magazine not enforced here — caller checks shotsLeft).
 * Suppressive uses full ROF until dedicated “rounds committed” UI exists.
 */
export function getAmmoConsumed(mode: FireMode, rof: number): number {
  const r = Math.max(0, Math.floor(rof));
  switch (mode) {
    case 'SemiAuto':
      return 1;
    case 'ThreeRoundBurst':
      return burstAmmo(r);
    case 'FullAuto':
    case 'Suppressive':
      return r;
    default:
      return 1;
  }
}

/**
 * Subtract autofire-incompatible modifiers when those toggles are on.
 * `modValues` maps label → bonus (from rangedCombatModifiers).
 */
export function stripAutofireIncompatibleMods(
  toggles: Record<string, boolean> | undefined,
  modValues: Record<string, number>,
): number {
  let delta = 0;
  for (const label of AUTOFIRE_INCOMPATIBLE_RANGED_MOD_LABELS) {
    if (toggles?.[label]) delta -= modValues[label] ?? 0;
  }
  return delta;
}
