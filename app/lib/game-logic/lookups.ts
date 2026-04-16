/**
 * Game constants and lookup tables for Cyberpunk 2020
 * Extracted from Foundry VTT system and CP2020 rulebook
 */

import { WeaponType, Concealability, Availability, Reliability, Zone, FireMode } from '../types';
import { rollDice } from './dice';

// ============================================================================
// Weapon Types and Attack Skills
// ============================================================================

export const weaponTypes: Record<string, WeaponType> = {
  pistol: 'Pistol',
  submachinegun: 'SMG',
  shotgun: 'Shotgun',
  rifle: 'Rifle',
  heavy: 'Heavy',
  melee: 'Melee',
  exotic: 'Exotic',
};

export const attackSkills: Record<WeaponType, string[]> = {
  Pistol: ['Handgun'],
  SMG: ['Submachinegun'],
  Shotgun: ['Rifle'],
  Rifle: ['Rifle'],
  Heavy: ['HeavyWeapons'],
  Melee: ['Fencing', 'Melee', 'Brawling'],
  Exotic: [],
};

// ============================================================================
// Attack Types
// ============================================================================

export const rangedAttackTypes = {
  auto: 'Auto',
  paint: 'Paint',
  drugs: 'Drugs',
  acid: 'Acid',
  taser: 'Taser',
  dart: 'Dart',
  squirt: 'Squirt',
  throwable: 'Throw',
  archer: 'Archer',
  laser: 'Laser',
  microwave: 'Microwave',
  shotgun: 'Shotgun',
  autoshotgun: 'Autoshotgun',
  grenade: 'Grenade',
  gas: 'Gas',
  flamethrow: 'Flamethrow',
  landmine: 'Landmine',
  claymore: 'Claymore',
  rpg: 'RPG',
  missile: 'Missile',
  explosiveCharge: 'Explocharge',
};

export const meleeAttackTypes = {
  melee: 'Melee',
  mono: 'Mono',
  martial: 'Martial',
  cyberbeast: 'Beast',
};

// ============================================================================
// Item Properties
// ============================================================================

export const concealability: Record<string, Concealability> = {
  pocket: 'P',
  jacket: 'J',
  longcoat: 'L',
  noHide: 'N',
};

export const concealabilityLabels: Record<Concealability, string> = {
  P: 'Pocket',
  J: 'Jacket',
  L: 'Long Coat',
  N: 'Cannot Hide',
};

export const availability: Record<string, Availability> = {
  excellent: 'E',
  common: 'C',
  rare: 'R',
  poor: 'P',
};

export const availabilityLabels: Record<Availability, string> = {
  E: 'Excellent',
  C: 'Common',
  R: 'Rare',
  P: 'Poor',
};

export const reliability: Record<string, Reliability> = {
  very: 'VR',
  standard: 'ST',
  unreliable: 'UR',
};

export const reliabilityLabels: Record<Reliability, string> = {
  VR: 'Very Reliable',
  ST: 'Standard',
  UR: 'Unreliable',
};

/**
 * Reliability fumble thresholds (on a nat 1, roll again;
 * if <= threshold, weapon jams/breaks)
 */
export const reliabilityFumbleThreshold: Record<Reliability, number> = {
  VR: 3,
  ST: 5,
  UR: 8,
};

// ============================================================================
// Fire Modes
// ============================================================================

export const fireModes: Record<FireMode, string> = {
  SemiAuto: 'Semi-Auto',
  ThreeRoundBurst: '3-Round Burst',
  FullAuto: 'Full Auto',
  Suppressive: 'Suppressive Fire',
};

/**
 * Ammo consumed per fire mode
 * Full auto uses the ROF value, burst always uses 3
 */
export function getAmmoConsumed(mode: FireMode, rof: number): number {
  switch (mode) {
    case 'SemiAuto':
      return 1;
    case 'ThreeRoundBurst':
      return 3;
    case 'FullAuto':
      return rof;
    case 'Suppressive':
      return rof;
  }
}

// ============================================================================
// Martial Arts
// ============================================================================

export const martialActions = {
  dodge: 'Dodge',
  blockParry: 'BlockParry',
  strike: 'Strike',
  kick: 'Kick',
  disarm: 'Disarm',
  sweepTrip: 'SweepTrip',
  grapple: 'Grapple',
  hold: 'Hold',
  choke: 'Choke',
  throw: 'Throw',
  escape: 'Escape',
};

export const martialActionBonuses: Record<string, Record<string, number>> = {
  'Martial Arts: Karate': { Strike: 2, Kick: 2, BlockParry: 2 },
  'Martial Arts: Judo': { Throw: 3, Hold: 3, Escape: 3 },
  'Martial Arts: Boxing': { Strike: 3, BlockParry: 3, Dodge: 1, Grapple: 2 },
  'Martial Arts: ThaiKickBoxing': { Strike: 3, Kick: 3 },
  'Martial Arts: ChoiLiFut': { Strike: 2, Kick: 2, BlockParry: 2 },
  'Martial Arts: Aikido': { BlockParry: 4, Throw: 3, Hold: 3, Escape: 3, Choke: 1 },
  'Martial Arts: AnimalKungFu': { Strike: 2, Kick: 2, Grapple: 2 },
  'Martial Arts: TaeKwonDo': { Strike: 3, Kick: 3, BlockParry: 1 },
  'Martial Arts: Savate': { Strike: 3, Kick: 4 },
  'Martial Arts: Wrestling': { Grapple: 3, Hold: 4, Choke: 3 },
  'Martial Arts: Capoeira': { Strike: 1, Kick: 2, Dodge: 2, SweepTrip: 3 },
  Brawling: {},
};

/** Lowercase alias → canonical key in {@link martialActionBonuses} (multiplayer-safe name resolution). */
const MARTIAL_ARTS_ALIASES: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const k of Object.keys(martialActionBonuses)) {
    m[k.toLowerCase()] = k;
  }
  Object.assign(m, {
    'martial arts: choi li fut': 'Martial Arts: ChoiLiFut',
    'martial arts: thai kick boxing': 'Martial Arts: ThaiKickBoxing',
    'martial arts: thai kickboxing': 'Martial Arts: ThaiKickBoxing',
    'martial arts: tae kwon do': 'Martial Arts: TaeKwonDo',
    'martial arts: animal kung fu': 'Martial Arts: AnimalKungFu',
  });
  return m;
})();

/**
 * Maps a skill name from the sheet (any alias) to the canonical martial arts key, or null if not a style.
 * Legacy untyped "Martial Arts" → null. Imported / Foundry names with spaces map to the same bonuses.
 */
export function resolveMartialArtsStyleKey(skillName: string): string | null {
  const t = skillName.trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === 'martial arts') return null;
  const canon = MARTIAL_ARTS_ALIASES[low];
  if (canon && martialActionBonuses[canon]) return canon;
  return null;
}

export function getMartialActionBonus(martialKey: string, actionKey: string): number {
  const canon = resolveMartialArtsStyleKey(martialKey);
  const key = canon ?? (martialActionBonuses[martialKey] ? martialKey : '');
  const style = (key && martialActionBonuses[key]) || {};
  return Number(style[actionKey] || 0);
}

/** CP2020: one skill per language; stored as `Know Language: <label>` for stable sync across sessions. */
export const KNOW_LANGUAGE_SKILL_PREFIX = 'Know Language: ' as const;

export function formatKnowLanguageSkill(language: string): string {
  const s = language.trim();
  if (!s) {
    throw new Error('Language name is required');
  }
  return `${KNOW_LANGUAGE_SKILL_PREFIX}${s}`;
}

export function isKnowLanguageSkill(skillName: string): boolean {
  return skillName.trim().startsWith(KNOW_LANGUAGE_SKILL_PREFIX);
}

/** Returns the language part after the prefix, or null if not a Know Language skill. */
export function parseKnowLanguageLabel(skillName: string): string | null {
  const t = skillName.trim();
  if (!t.toLowerCase().startsWith(KNOW_LANGUAGE_SKILL_PREFIX.toLowerCase())) return null;
  const rest = t.slice(t.indexOf(':') + 1).trim();
  return rest || null;
}

// ============================================================================
// Range and DCs
// ============================================================================

export type RangeBracket = 'PointBlank' | 'Close' | 'Medium' | 'Long' | 'Extreme';

export const rangeBrackets: Record<RangeBracket, { dc: number; label: string }> = {
  PointBlank: { dc: 10, label: 'Point Blank' },
  Close: { dc: 15, label: 'Close' },
  Medium: { dc: 20, label: 'Medium' },
  Long: { dc: 25, label: 'Long' },
  Extreme: { dc: 30, label: 'Extreme' },
};

/**
 * Get the maximum distance (in meters) for each range bracket
 * based on a weapon's range stat (CP2020: weapon listing "Range" in m).
 * Returns null when the weapon range is missing or not a positive number — UI should show "—" not NaN.
 */
export function getRangeDistance(bracket: RangeBracket, weaponRange: number): number | null {
  const r = Number(weaponRange);
  const ok = Number.isFinite(r) && r > 0;
  switch (bracket) {
    case 'PointBlank':
      return 1;
    case 'Close':
      return ok ? Math.floor(r / 4) : null;
    case 'Medium':
      return ok ? Math.floor(r / 2) : null;
    case 'Long':
      return ok ? r : null;
    case 'Extreme':
      return ok ? r * 2 : null;
  }
}

/**
 * Determine range bracket from actual distance
 */
export function getRangeBracket(distance: number, weaponRange: number): RangeBracket {
  if (distance <= 1) return 'PointBlank';
  if (distance <= weaponRange / 4) return 'Close';
  if (distance <= weaponRange / 2) return 'Medium';
  if (distance <= weaponRange) return 'Long';
  return 'Extreme';
}

// ============================================================================
// Ranged Combat Modifiers
// ============================================================================

export const rangedCombatModifiers: Record<string, number> = {
  'Aimed shot (specific area)': -4,
  'Aiming (1 round)': 1,
  'Aiming (2 rounds)': 2,
  'Aiming (3 rounds, max)': 3,
  Ambush: 5,
  Blinded: -3,
  'Dual wield (off hand)': -3,
  'Fast draw': -3,
  Hipfire: -2,
  Ricochet: -5,
  'Running (shooter)': -3,
  'Turning to face target': -2,
  'Target immobile': 4,
  'Target behind cover (1/4)': -2,
  'Target behind cover (1/2)': -3,
  'Target behind cover (3/4)': -4,
};

// ============================================================================
// Hit Locations (d10)
// ============================================================================

export const defaultTargetLocations: Zone[] = ['Head', 'Torso', 'rArm', 'lArm', 'rLeg', 'lLeg'];

/**
 * Hit location lookup table for d10 rolls (CP2020 rulebook)
 * 1 = Head, 2-4 = Torso, 5 = R.Arm, 6 = L.Arm, 7-8 = R.Leg, 9-10 = L.Leg
 */
export const hitLocationTable: Record<number, Zone> = {
  1: 'Head',
  2: 'Torso',
  3: 'Torso',
  4: 'Torso',
  5: 'rArm',
  6: 'lArm',
  7: 'rLeg',
  8: 'rLeg',
  9: 'lLeg',
  10: 'lLeg',
};

export const hitLocationRollRanges: Record<Zone, string> = {
  Head: '1',
  Torso: '2-4',
  rArm: '5',
  lArm: '6',
  rLeg: '7-8',
  lLeg: '9-10',
};

export function getHitLocation(roll: number): Zone | null {
  if (roll < 1 || roll > 10) return null;
  return hitLocationTable[roll];
}

/** FNFF hit location: single unmodified d10 on the standard table (use `flat:` so d10 does not explode). */
export function rollFnffHitLocation(): { d10: number; zone: Zone | null } {
  const r = rollDice('flat:1d10');
  if (!r || r.firstD10Face === undefined) return { d10: 0, zone: null };
  const d10 = r.firstD10Face;
  return { d10, zone: getHitLocation(d10) };
}

/**
 * Default hit location structure for a new character
 */
export function defaultHitLocations(): Record<Zone, { location: number[]; stoppingPower: number; ablation: number }> {
  return {
    Head: { location: [1], stoppingPower: 0, ablation: 0 },
    Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
    rArm: { location: [5], stoppingPower: 0, ablation: 0 },
    lArm: { location: [6], stoppingPower: 0, ablation: 0 },
    rLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
    lLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
  };
}

// ============================================================================
// Fumble Tables
// ============================================================================

export const rangedFumbleTable: Record<number, string> = {
  1: 'Lose next turn pulling trigger (weapon jams)',
  2: 'Lose next turn clearing jam',
  3: 'Lose next 2 turns clearing jam',
  4: 'Weapon disabled, needs Weaponsmith repair',
  5: 'Weapon explodes! 1d6 damage to hand',
  6: 'Weapon explodes! 1d6 damage to hand, adjacent',
};

export const meleeFumbleTable: Record<number, string> = {
  1: 'Lose your balance, -2 next turn',
  2: 'Stumble, lose next attack',
  3: 'Drop weapon (1 turn to recover)',
  4: 'Trip and fall (must spend next turn getting up)',
  5: 'Hit yourself! Roll normal damage',
  6: 'Hit friend! Roll normal damage to nearest ally',
};

/**
 * FNFF Reflex (Combat) fumble table — roll 1d10 after a natural 1 on the attack d10.
 * Reliability: roll 1d10; fail if result ≤ threshold (VR 3 / ST 5 / UR 8), same as Foundry.
 */
export type ReflexCombatFumbleRow = {
  min: number;
  max: number;
  description: string;
  needsReliability?: 'discharge' | 'jam';
  needsLocation?: boolean;
};

export const reflexCombatFumbleRows: ReflexCombatFumbleRow[] = [
  { min: 1, max: 4, description: 'No extra weapon effect. You just screw up.' },
  { min: 5, max: 5, description: 'Drop your weapon.' },
  {
    min: 6,
    max: 6,
    description: 'Weapon discharges or strikes something harmless — make reliability roll.',
    needsReliability: 'discharge',
  },
  {
    min: 7,
    max: 7,
    description: 'Weapon jams or embeds — make reliability roll.',
    needsReliability: 'jam',
  },
  {
    min: 8,
    max: 8,
    description: 'You wound yourself. Roll hit location and damage.',
    needsLocation: true,
  },
  {
    min: 9,
    max: 10,
    description: 'You wound a member of your party. Roll location and damage for nearest ally.',
    needsLocation: true,
  },
];

export function pickReflexCombatFumbleRow(d10: number): ReflexCombatFumbleRow {
  const n = Math.min(10, Math.max(1, Math.floor(d10)));
  for (const row of reflexCombatFumbleRows) {
    if (n >= row.min && n <= row.max) return row;
  }
  return reflexCombatFumbleRows[reflexCombatFumbleRows.length - 1];
}

// ============================================================================
// Skill Categories and Master Skill List
// ============================================================================

export const skillCategories = {
  SPECIAL: 'Special Abilities',
  ATTR: 'Attractiveness',
  BODY: 'Body',
  COOL: 'Cool/Will',
  EMP: 'Empathy',
  INT: 'Intelligence',
  REF: 'Reflexes',
  TECH: 'Technical',
};

export interface SkillDefinition {
  name: string;
  linkedStat: string;
  category: string;
}

/** CP2020: one Martial Arts *style* per skill. Names align with {@link resolveMartialArtsStyleKey} / Foundry imports. */
export const martialArtsStyleSkillDefinitions: SkillDefinition[] = [
  { name: 'Martial Arts: Aikido', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Animal Kung Fu', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Boxing', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Capoeira', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Choi Li Fut', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Judo', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Karate', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Savate', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Tae Kwon Do', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Thai Kick Boxing', linkedStat: 'ref', category: 'REF' },
  { name: 'Martial Arts: Wrestling', linkedStat: 'ref', category: 'REF' },
];

export const masterSkillList: SkillDefinition[] = [
  // ATTR
  { name: 'Personal Grooming', linkedStat: 'attr', category: 'ATTR' },
  { name: 'Wardrobe & Style', linkedStat: 'attr', category: 'ATTR' },
  // BODY
  { name: 'Endurance', linkedStat: 'bt', category: 'BODY' },
  { name: 'Strength Feat', linkedStat: 'bt', category: 'BODY' },
  { name: 'Swimming', linkedStat: 'bt', category: 'BODY' },
  // COOL/WILL
  { name: 'Interrogation', linkedStat: 'cool', category: 'COOL' },
  { name: 'Intimidate', linkedStat: 'cool', category: 'COOL' },
  { name: 'Oratory', linkedStat: 'cool', category: 'COOL' },
  { name: 'Resist Torture/Drugs', linkedStat: 'cool', category: 'COOL' },
  { name: 'Streetwise', linkedStat: 'cool', category: 'COOL' },
  // EMP
  { name: 'Human Perception', linkedStat: 'emp', category: 'EMP' },
  { name: 'Interview', linkedStat: 'emp', category: 'EMP' },
  { name: 'Leadership', linkedStat: 'emp', category: 'EMP' },
  { name: 'Seduction', linkedStat: 'emp', category: 'EMP' },
  { name: 'Social', linkedStat: 'emp', category: 'EMP' },
  { name: 'Persuasion & Fast Talk', linkedStat: 'emp', category: 'EMP' },
  { name: 'Perform', linkedStat: 'emp', category: 'EMP' },
  // INT
  { name: 'Accounting', linkedStat: 'int', category: 'INT' },
  { name: 'Anthropology', linkedStat: 'int', category: 'INT' },
  { name: 'Awareness/Notice', linkedStat: 'int', category: 'INT' },
  { name: 'Biology', linkedStat: 'int', category: 'INT' },
  { name: 'Botany', linkedStat: 'int', category: 'INT' },
  { name: 'Chemistry', linkedStat: 'int', category: 'INT' },
  { name: 'Composition', linkedStat: 'int', category: 'INT' },
  { name: 'Diagnose Illness', linkedStat: 'int', category: 'INT' },
  { name: 'Education & Gen. Know', linkedStat: 'int', category: 'INT' },
  { name: 'Expert', linkedStat: 'int', category: 'INT' },
  { name: 'Gamble', linkedStat: 'int', category: 'INT' },
  { name: 'Geology', linkedStat: 'int', category: 'INT' },
  { name: 'Hide/Evade', linkedStat: 'int', category: 'INT' },
  { name: 'History', linkedStat: 'int', category: 'INT' },
  { name: 'Library Search', linkedStat: 'int', category: 'INT' },
  { name: 'Mathematics', linkedStat: 'int', category: 'INT' },
  { name: 'Physics', linkedStat: 'int', category: 'INT' },
  { name: 'Programming', linkedStat: 'int', category: 'INT' },
  { name: 'Shadow/Track', linkedStat: 'int', category: 'INT' },
  { name: 'Stock Market', linkedStat: 'int', category: 'INT' },
  { name: 'System Knowledge', linkedStat: 'int', category: 'INT' },
  { name: 'Teaching', linkedStat: 'int', category: 'INT' },
  { name: 'Wilderness Survival', linkedStat: 'int', category: 'INT' },
  { name: 'Zoology', linkedStat: 'int', category: 'INT' },
  // REF
  { name: 'Archery', linkedStat: 'ref', category: 'REF' },
  { name: 'Athletics', linkedStat: 'ref', category: 'REF' },
  { name: 'Brawling', linkedStat: 'ref', category: 'REF' },
  { name: 'Dance', linkedStat: 'ref', category: 'REF' },
  { name: 'Dodge & Escape', linkedStat: 'ref', category: 'REF' },
  { name: 'Driving', linkedStat: 'ref', category: 'REF' },
  { name: 'Fencing', linkedStat: 'ref', category: 'REF' },
  { name: 'Handgun', linkedStat: 'ref', category: 'REF' },
  { name: 'Heavy Weapons', linkedStat: 'ref', category: 'REF' },
  ...martialArtsStyleSkillDefinitions,
  { name: 'Melee', linkedStat: 'ref', category: 'REF' },
  { name: 'Motorcycle', linkedStat: 'ref', category: 'REF' },
  { name: 'Operate Hvy. Machinery', linkedStat: 'ref', category: 'REF' },
  { name: 'Pilot (Gyro)', linkedStat: 'ref', category: 'REF' },
  { name: 'Pilot (Fixed Wing)', linkedStat: 'ref', category: 'REF' },
  { name: 'Pilot (Dirigible)', linkedStat: 'ref', category: 'REF' },
  { name: 'Pilot (Vect. Thrust)', linkedStat: 'ref', category: 'REF' },
  { name: 'Rifle', linkedStat: 'ref', category: 'REF' },
  { name: 'Stealth', linkedStat: 'ref', category: 'REF' },
  { name: 'Submachinegun', linkedStat: 'ref', category: 'REF' },
  // TECH
  { name: 'Aero Tech', linkedStat: 'tech', category: 'TECH' },
  { name: 'AV Tech', linkedStat: 'tech', category: 'TECH' },
  { name: 'Basic Tech', linkedStat: 'tech', category: 'TECH' },
  { name: 'Cryotank Operation', linkedStat: 'tech', category: 'TECH' },
  { name: 'Cyberdeck Design', linkedStat: 'tech', category: 'TECH' },
  { name: 'CyberTech', linkedStat: 'tech', category: 'TECH' },
  { name: 'Demolitions', linkedStat: 'tech', category: 'TECH' },
  { name: 'Disguise', linkedStat: 'tech', category: 'TECH' },
  { name: 'Electronics', linkedStat: 'tech', category: 'TECH' },
  { name: 'Elect. Security', linkedStat: 'tech', category: 'TECH' },
  { name: 'First Aid', linkedStat: 'tech', category: 'TECH' },
  { name: 'Forgery', linkedStat: 'tech', category: 'TECH' },
  { name: 'Gyro Tech', linkedStat: 'tech', category: 'TECH' },
  { name: 'Paint or Draw', linkedStat: 'tech', category: 'TECH' },
  { name: 'Photo & Film', linkedStat: 'tech', category: 'TECH' },
  { name: 'Pharmaceuticals', linkedStat: 'tech', category: 'TECH' },
  { name: 'Pick Lock', linkedStat: 'tech', category: 'TECH' },
  { name: 'Pick Pocket', linkedStat: 'tech', category: 'TECH' },
  { name: 'Play Instrument', linkedStat: 'tech', category: 'TECH' },
  { name: 'Weaponsmith', linkedStat: 'tech', category: 'TECH' },
];
