/**
 * Helpers for persistent limb-severance conditions.
 *
 * CP2020 FNFF (L6424): a single hit dealing >8 final damage to a limb severs
 * that limb and forces an immediate Mortal-0 death save. The mechanical effect
 * (wound track jump, forced save) is handled by the damage pipeline; the
 * narrative/persistent state is surfaced here as a condition on the character
 * so the Body tab, GM context, and save/load all preserve it.
 *
 * Condition naming uses snake_case so the standard "replace _ with space"
 * display in the condition badge renders cleanly: e.g. `severed_right_arm`
 * → "severed right arm".
 */

import type { Zone } from '../types';

const ZONE_TO_SUFFIX: Partial<Record<Zone, string>> = {
  rArm: 'right_arm',
  lArm: 'left_arm',
  rLeg: 'right_leg',
  lLeg: 'left_leg',
};

/** Condition name for a severed limb, or null if the zone cannot be severed (Head/Torso). */
export function severedConditionName(zone: Zone): string | null {
  const suffix = ZONE_TO_SUFFIX[zone];
  return suffix ? `severed_${suffix}` : null;
}

const SEVERED_PREFIX = 'severed_';

const SUFFIX_TO_ZONE: Record<string, Zone> = {
  right_arm: 'rArm',
  left_arm: 'lArm',
  right_leg: 'rLeg',
  left_leg: 'lLeg',
};

/** True for any `severed_*` limb condition name. */
export function isSeveredConditionName(name: string): boolean {
  if (!name.startsWith(SEVERED_PREFIX)) return false;
  return SUFFIX_TO_ZONE[name.slice(SEVERED_PREFIX.length)] !== undefined;
}

/** Zone for a severed condition name (`severed_right_arm` → `rArm`), or null. */
export function zoneFromSeveredConditionName(name: string): Zone | null {
  if (!name.startsWith(SEVERED_PREFIX)) return null;
  return SUFFIX_TO_ZONE[name.slice(SEVERED_PREFIX.length)] ?? null;
}
