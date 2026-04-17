/**
 * CP2020 character generation (VIEW FROM THE EDGE): Character Points, stats 2–10,
 * Career Skill package (40 pts + special ability), Pickup Skills (REF+INT),
 * starting funds from Occupation Table × months (1D6/3) with unemployment check.
 */

import type { Character, RoleType, Skill, Stats } from '@/lib/types';
import { ROLE_SPECIAL_ABILITIES, createStatBlock } from '@/lib/types';
import { recalcCharacterForGm } from '@/lib/gm/character-mutations';

export type Cp2020PointMethod = 'random' | 'fast' | 'cinematic';

export type Cp2020Rng = () => number; // uniform in [0, 1)

export function rollD6(rng: Cp2020Rng): number {
  return 1 + Math.floor(rng() * 6);
}

export function rollD10(rng: Cp2020Rng): number {
  return 1 + Math.floor(rng() * 10);
}

/** Method 1: roll 9D10, sum = Character Points (rules p.25). */
export function rollCharacterPointsRandom(rng: Cp2020Rng): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += rollD10(rng);
  return sum;
}

/** Method 2: roll 1D10 per stat, re-roll results ≤2, assign as desired — we random-assign. */
export function rollCharacterPointsFast(rng: Cp2020Rng): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = rollD10(rng);
    while (v <= 2) v = rollD10(rng);
    sum += v;
  }
  return sum;
}

/** Ref-chosen point budgets (VIEW FROM THE EDGE p.25). */
export const CP2020_CINEMATIC_PRESETS = {
  average: 50,
  minor_supporting: 60,
  minor_hero: 75,
  major_supporting: 70,
  major_hero: 80,
} as const;

export type Cp2020CinematicPreset = keyof typeof CP2020_CINEMATIC_PRESETS;

/** Cinematic / Ref-chosen point budgets (p.25). */
export function cinematicCharacterPoints(
  preset: Cp2020CinematicPreset | (string & {}) | number,
): number {
  if (typeof preset === 'number' && Number.isFinite(preset)) {
    return Math.max(18, Math.min(90, Math.floor(preset)));
  }
  return CP2020_CINEMATIC_PRESETS[preset as Cp2020CinematicPreset] ?? 50;
}

export const CP2020_STAT_KEYS: Array<keyof Stats> = [
  'int',
  'ref',
  'tech',
  'cool',
  'attr',
  'luck',
  'ma',
  'bt',
  'emp',
];

const STAT_KEYS = CP2020_STAT_KEYS;

/**
 * Split Character Points across nine stats (each 2–10). Sum of bases equals `totalPoints`.
 * If the roll is impossible (outside [18, 90]), clamps total into range.
 */
export function allocateStatsFromCharacterPoints(totalPoints: number, rng: Cp2020Rng): Stats {
  const clamped = Math.max(18, Math.min(90, Math.floor(totalPoints)));
  let remaining = clamped - STAT_KEYS.length * 2;
  const bases = Object.fromEntries(STAT_KEYS.map((k) => [k, 2])) as Record<keyof Stats, number>;
  while (remaining > 0) {
    const k = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)];
    if (bases[k] < 10) {
      bases[k]++;
      remaining--;
    }
  }
  return {
    int: createStatBlock(bases.int),
    ref: createStatBlock(bases.ref),
    tech: createStatBlock(bases.tech),
    cool: createStatBlock(bases.cool),
    attr: createStatBlock(bases.attr),
    luck: createStatBlock(bases.luck),
    ma: createStatBlock(bases.ma),
    bt: createStatBlock(bases.bt),
    emp: createStatBlock(bases.emp),
  };
}

/** Career skill names per role (10 entries including special ability name). Special is first. */
export const ROLE_CAREER_PACKAGES: Record<RoleType, string[]> = {
  Solo: [
    ROLE_SPECIAL_ABILITIES.Solo,
    'Awareness/Notice',
    'Handgun',
    'Brawling',
    'Melee',
    'Weaponsmith',
    'Rifle',
    'Athletics',
    'Submachinegun',
    'Stealth',
  ],
  Rockerboy: [
    ROLE_SPECIAL_ABILITIES.Rockerboy,
    'Awareness/Notice',
    'Perform',
    'Wardrobe & Style',
    'Composition',
    'Brawling',
    'Play Instrument',
    'Streetwise',
    'Persuasion & Fast Talk',
    'Seduction',
  ],
  Netrunner: [
    ROLE_SPECIAL_ABILITIES.Netrunner,
    'Awareness/Notice',
    'Basic Tech',
    'Education',
    'System Knowledge',
    'CyberTech',
    'Cyberdeck Design',
    'Composition',
    'Electronics',
    'Programming',
  ],
  Media: [
    ROLE_SPECIAL_ABILITIES.Media,
    'Awareness/Notice',
    'Composition',
    'Education',
    'Persuasion & Fast Talk',
    'Human Perception',
    'Social',
    'Streetwise',
    'Photo & Film',
    'Interview',
  ],
  Nomad: [
    ROLE_SPECIAL_ABILITIES.Nomad,
    'Awareness/Notice',
    'Endurance',
    'Melee',
    'Rifle',
    'Driving',
    'Basic Tech',
    'Wilderness Survival',
    'Brawling',
    'Athletics',
  ],
  Fixer: [
    ROLE_SPECIAL_ABILITIES.Fixer,
    'Awareness/Notice',
    'Forgery',
    'Handgun',
    'Brawling',
    'Melee',
    'Pick Lock',
    'Pick Pocket',
    'Intimidate',
    'Persuasion & Fast Talk',
  ],
  Cop: [
    ROLE_SPECIAL_ABILITIES.Cop,
    'Awareness/Notice',
    'Handgun',
    'Human Perception',
    'Athletics',
    'Education',
    'Brawling',
    'Melee',
    'Interrogation',
    'Streetwise',
  ],
  Corp: [
    ROLE_SPECIAL_ABILITIES.Corp,
    'Awareness/Notice',
    'Human Perception',
    'Education',
    'Library Search',
    'Social',
    'Persuasion & Fast Talk',
    'Stock Market',
    'Wardrobe & Style',
    'Personal Grooming',
  ],
  Techie: [
    ROLE_SPECIAL_ABILITIES.Techie,
    'Awareness/Notice',
    'Basic Tech',
    'CyberTech',
    'Teaching',
    'Education',
    'Electronics',
    'Gyro Tech',
    'Aero Tech',
    'Weaponsmith',
  ],
  Medtechie: [
    ROLE_SPECIAL_ABILITIES.Medtechie,
    'Awareness/Notice',
    'Basic Tech',
    'Diagnose Illness',
    'Education',
    'Cryotank Operation',
    'Library Search',
    'Pharmaceuticals',
    'Zoology',
    'Human Perception',
  ],
};

/** Default linked stat for skills (FNFF lists; special abilities handled separately). */
const SKILL_LINKED_STAT: Record<string, keyof Stats> = {
  'Awareness/Notice': 'int',
  Handgun: 'ref',
  Brawling: 'ref',
  'Martial Arts': 'ref',
  Melee: 'ref',
  Weaponsmith: 'tech',
  Rifle: 'ref',
  Athletics: 'ref',
  Submachinegun: 'ref',
  Stealth: 'ref',
  Perform: 'emp',
  'Wardrobe & Style': 'attr',
  Composition: 'int',
  'Play Instrument': 'tech',
  Streetwise: 'cool',
  'Persuasion & Fast Talk': 'emp',
  Seduction: 'emp',
  'Basic Tech': 'tech',
  Education: 'int',
  'System Knowledge': 'int',
  CyberTech: 'tech',
  'Cyberdeck Design': 'tech',
  Electronics: 'tech',
  Programming: 'int',
  'Human Perception': 'emp',
  Social: 'emp',
  'Photo & Film': 'tech',
  Interview: 'emp',
  Endurance: 'bt',
  Driving: 'ref',
  'Wilderness Survival': 'int',
  Forgery: 'tech',
  'Pick Lock': 'tech',
  'Pick Pocket': 'tech',
  Intimidate: 'cool',
  Interrogation: 'cool',
  'Library Search': 'int',
  'Stock Market': 'int',
  'Personal Grooming': 'attr',
  Teaching: 'int',
  'Diagnose Illness': 'tech',
  'Cryotank Operation': 'tech',
  Pharmaceuticals: 'tech',
  Zoology: 'int',
  'First Aid': 'tech',
  'Dodge & Escape': 'ref',
  Gambling: 'int',
  Leadership: 'emp',
};

const SA_LINKED: Partial<Record<RoleType, keyof Stats>> = {
  Solo: 'ref',
  Rockerboy: 'cool',
  Netrunner: 'int',
  Media: 'int',
  Nomad: 'int',
  Fixer: 'cool',
  Cop: 'cool',
  Corp: 'int',
  Techie: 'tech',
  Medtechie: 'tech',
};

function skillCategory(stat: keyof Stats): string {
  return stat.toUpperCase();
}

function linkedStatForSkill(name: string, role: RoleType, isSpecial: boolean): keyof Stats {
  if (isSpecial) return SA_LINKED[role] ?? 'int';
  return SKILL_LINKED_STAT[name] ?? 'int';
}

/** Distribute 40 career points across 10 skills; special ability gets 1–10 inclusive. */
export function distributeCareerSkills(
  role: RoleType,
  rng: Cp2020Rng,
): { skills: Skill[]; specialValue: number } {
  const pack = ROLE_CAREER_PACKAGES[role];
  const specialName = ROLE_SPECIAL_ABILITIES[role];
  const specialMax = 10;
  const specialMin = 1;
  const specialValue = specialMin + Math.floor(rng() * (specialMax - specialMin + 1));

  const otherNames = pack.filter((n) => n !== specialName);
  let pool = 40 - specialValue;
  const values = new Map<string, number>();
  values.set(specialName, specialValue);
  for (const n of otherNames) values.set(n, 0);

  let guard = pool * 30;
  while (pool > 0 && guard-- > 0) {
    const n = otherNames[Math.floor(rng() * otherNames.length)];
    const cur = values.get(n) ?? 0;
    if (cur < 10) {
      values.set(n, cur + 1);
      pool--;
    } else if (!otherNames.some((x) => (values.get(x) ?? 0) < 10)) {
      break;
    }
  }

  const skills: Skill[] = pack.map((name) => {
    const isSpecial = name === specialName;
    const st = linkedStatForSkill(name, role, isSpecial);
    return {
      id: crypto.randomUUID(),
      name,
      value: values.get(name) ?? 0,
      linkedStat: st,
      category: skillCategory(st),
      isChipped: false,
      ...(isSpecial ? { isSpecialAbility: true } : {}),
    };
  });

  return { skills, specialValue };
}

/** Pickup skill names (career-excluded pool; VIEW FROM THE EDGE p.46). */
export const CP2020_PICKUP_POOL: readonly string[] = [
  'Dodge & Escape',
  'Driving',
  'First Aid',
  'Gambling',
  'Stealth',
  'Leadership',
  'Forgery',
  'Electronics',
  'Personal Grooming',
  'Wardrobe & Style',
  'Library Search',
  'Stock Market',
  'Wilderness Survival',
];

const PICKUP_POOL: readonly string[] = CP2020_PICKUP_POOL;

function shuffle<T>(arr: T[], rng: Cp2020Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Pickup pool: REF+INT points, skills not in career (p.46). */
export function distributePickupSkills(
  careerNames: Set<string>,
  refBase: number,
  intBase: number,
  rng: Cp2020Rng,
): Skill[] {
  let pool = Math.max(0, Math.floor(refBase + intBase));
  const available = PICKUP_POOL.filter((n) => !careerNames.has(n));
  if (available.length === 0 || pool === 0) return [];

  const pickCount = Math.min(available.length, 3 + Math.floor(rng() * 4));
  const chosen = shuffle(available, rng).slice(0, pickCount);
  const values = new Map<string, number>();
  for (const n of chosen) values.set(n, 0);

  let guard = pool * 20;
  while (pool > 0 && guard-- > 0) {
    const n = chosen[Math.floor(rng() * chosen.length)];
    const cur = values.get(n) ?? 0;
    if (cur < 10) {
      values.set(n, cur + 1);
      pool--;
    } else if (!chosen.some((c) => (values.get(c) ?? 0) < 10)) {
      break;
    }
  }

  return chosen.map((name) => {
    const st = SKILL_LINKED_STAT[name] ?? 'int';
    return {
      id: crypto.randomUUID(),
      name,
      value: values.get(name) ?? 0,
      linkedStat: st,
      category: skillCategory(st),
      isChipped: false,
    };
  });
}

/** Monthly salary (euro) from Occupation Table (p.58). Levels 1–5 share the first band. */
const MONTHLY_SALARY: Record<RoleType, { low: number; byLevel: Record<number, number> }> = {
  Rockerboy: {
    low: 1000,
    byLevel: { 6: 1500, 7: 2000, 8: 5000, 9: 8000, 10: 12000 },
  },
  Solo: { low: 2000, byLevel: { 6: 3000, 7: 4500, 8: 7000, 9: 9000, 10: 12000 } },
  Cop: { low: 1000, byLevel: { 6: 1200, 7: 3000, 8: 5000, 9: 7000, 10: 9000 } },
  Corp: { low: 1500, byLevel: { 6: 3000, 7: 5000, 8: 7000, 9: 9000, 10: 12000 } },
  Media: { low: 1000, byLevel: { 6: 1200, 7: 3000, 8: 5000, 9: 7000, 10: 10000 } },
  Fixer: { low: 1500, byLevel: { 6: 3000, 7: 5000, 8: 7000, 9: 8000, 10: 10000 } },
  Techie: { low: 1000, byLevel: { 6: 2000, 7: 3000, 8: 4000, 9: 5000, 10: 8000 } },
  Netrunner: { low: 1000, byLevel: { 6: 2000, 7: 3000, 8: 5000, 9: 7000, 10: 10000 } },
  Medtechie: { low: 1600, byLevel: { 6: 3000, 7: 5000, 8: 7000, 9: 10000, 10: 15000 } },
  Nomad: { low: 1000, byLevel: { 6: 1500, 7: 2000, 8: 3000, 9: 4000, 10: 5000 } },
};

export function monthlySalaryEb(role: RoleType, specialAbilityLevel: number): number {
  const row = MONTHLY_SALARY[role];
  const lvl = Math.max(1, Math.min(10, Math.floor(specialAbilityLevel)));
  if (lvl <= 5) return row.low;
  return row.byLevel[lvl] ?? row.low;
}

/**
 * Starting cash: monthly × (1D6/3) months employed, then if D6>4 you are unemployed (p.58).
 * Uses book rounding (down) for the fractional months step.
 */
export function rollStartingEurobucks(role: RoleType, specialAbilityLevel: number, rng: Cp2020Rng): number {
  const monthly = monthlySalaryEb(role, specialAbilityLevel);
  const months = Math.max(1, Math.floor(rollD6(rng) / 3));
  let total = monthly * months;
  if (rollD6(rng) > 4) {
    total = Math.floor(total / 2);
  }
  return Math.max(0, total);
}

const DEFAULT_HIT_LOCATIONS: Character['hitLocations'] = {
  Head: { location: [1], stoppingPower: 0, ablation: 0 },
  Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
  rArm: { location: [5], stoppingPower: 0, ablation: 0 },
  lArm: { location: [6], stoppingPower: 0, ablation: 0 },
  lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
  rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
};

export interface GenerateCp2020CharacterInput {
  sessionId: string;
  /** Empty string or omit for an unclaimed slot (GM). */
  userId?: string;
  /** Player character vs NPC sheet (NPCs use userId ''). */
  kind?: 'character' | 'npc';
  name: string;
  role: RoleType;
  method: Cp2020PointMethod;
  cinematicPreset?: Cp2020CinematicPreset | number;
  age?: number;
  rng: Cp2020Rng;
}

/** Rough power tier for AI-spawned NPCs (cinematic point budget, p.25). */
export const NPC_THREAT_CINEMATIC_POINTS = {
  mook: 40,
  average: 52,
  capable: 65,
  elite: 80,
} as const;

export type NpcThreatLevel = keyof typeof NPC_THREAT_CINEMATIC_POINTS;

export function npcThreatToCinematicPoints(level: string | undefined): number {
  const key = (level ?? 'average').toLowerCase() as NpcThreatLevel;
  return NPC_THREAT_CINEMATIC_POINTS[key] ?? NPC_THREAT_CINEMATIC_POINTS.average;
}

/** Uniform [0,1) using crypto; safe for server-side NPC/PC generation. */
export function createCryptoRng(): Cp2020Rng {
  return () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! / 0x100000000;
  };
}

export function resolveCharacterPoints(
  method: Cp2020PointMethod,
  rng: Cp2020Rng,
  cinematic?: Cp2020CinematicPreset | number,
): number {
  if (method === 'random') return rollCharacterPointsRandom(rng);
  if (method === 'fast') return rollCharacterPointsFast(rng);
  return cinematicCharacterPoints(cinematic ?? 'average');
}

/** Build a full Character (client model); run through recalcCharacterForGm before play. */
export function generateCp2020Character(input: GenerateCp2020CharacterInput): Character {
  const { sessionId, name, role, method, rng } = input;
  const kind = input.kind ?? 'character';
  const userId = kind === 'npc' ? '' : (input.userId ?? '');
  const points = resolveCharacterPoints(method, rng, input.cinematicPreset);
  const stats = allocateStatsFromCharacterPoints(points, rng);
  const { skills: careerSkills, specialValue } = distributeCareerSkills(role, rng);
  const careerNames = new Set(careerSkills.map((s) => s.name));
  const pickup = distributePickupSkills(careerNames, stats.ref.base, stats.int.base, rng);
  const allSkills = [...careerSkills, ...pickup];
  const eurobucks = rollStartingEurobucks(role, specialValue, rng);

  const typ: Character['type'] = kind === 'npc' ? 'npc' : 'character';
  const raw: Character = {
    id: crypto.randomUUID(),
    userId,
    sessionId,
    name,
    type: typ,
    isNpc: typ === 'npc',
    team: typ === 'npc' ? 'hostile' : 'party',
    imageUrl: '',
    role,
    age: input.age ?? 20 + rollD6(rng) + rollD6(rng),
    points,
    stats,
    specialAbility: { name: ROLE_SPECIAL_ABILITIES[role], value: specialValue },
    reputation: 0,
    improvementPoints: 0,
    skills: allSkills,
    damage: 0,
    isStunned: false,
    isStabilized: false,
    conditions: [],
    hitLocations: DEFAULT_HIT_LOCATIONS,
    sdp: {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks,
    items: [],
    combatModifiers: { initiative: 0, stunSave: 0 },
    netrunDeck: null,
    lifepath: null,
  };

  return recalcCharacterForGm(raw);
}

/** Wizard / manual sheet: fixed career & pickup lines validated against CP2020 totals. */
export interface Cp2020ChargenBuildInput {
  sessionId: string;
  userId?: string;
  kind?: 'character' | 'npc';
  name: string;
  role: RoleType;
  age: number;
  /** Total Character Points; must equal the sum of `statBases` (VIEW FROM THE EDGE p.25). */
  points: number;
  /** Nine stats, each base 2–10. */
  statBases: Record<keyof Stats, number>;
  /** One entry per career skill name for `role`; special ability 1–10, others 0–10; sum 40. */
  careerValuesByName: Record<string, number>;
  /** Pickup skills not in career; each 0–10; total points ≤ REF+INT (bases). */
  pickup: { name: string; value: number }[];
  eurobucks: number;
}

const PICKUP_NAME_SET = new Set(CP2020_PICKUP_POOL);

export function validateCp2020Chargen(input: Cp2020ChargenBuildInput): string[] {
  const err: string[] = [];
  const { role, points, statBases, careerValuesByName, pickup } = input;

  if (!Number.isFinite(points) || points < 18 || points > 90) {
    err.push('Character Points must be between 18 and 90.');
  }

  let statSum = 0;
  for (const k of CP2020_STAT_KEYS) {
    const v = statBases[k];
    if (!Number.isFinite(v) || v < 2 || v > 10) {
      err.push(`Stat ${String(k).toUpperCase()} must be between 2 and 10.`);
    } else {
      statSum += v;
    }
  }
  if (statSum !== points) {
    err.push(`Stat bases sum to ${statSum} but Character Points are ${points}.`);
  }

  const pack = ROLE_CAREER_PACKAGES[role];
  const specialName = ROLE_SPECIAL_ABILITIES[role];
  let careerTotal = 0;
  for (const name of pack) {
    const v = careerValuesByName[name];
    if (!Number.isFinite(v)) {
      err.push(`Career skill "${name}" is missing a value.`);
      continue;
    }
    const isSpecial = name === specialName;
    if (isSpecial) {
      if (v < 1 || v > 10) err.push(`Special ability must be between 1 and 10.`);
    } else if (v < 0 || v > 10) {
      err.push(`Career skill "${name}" must be between 0 and 10.`);
    }
    careerTotal += v;
  }
  for (const key of Object.keys(careerValuesByName)) {
    if (!pack.includes(key)) err.push(`Unknown career skill "${key}" for role ${role}.`);
  }
  if (careerTotal !== 40) err.push(`Career skills must total 40 points (currently ${careerTotal}).`);

  const careerNames = new Set(pack);
  const refB = statBases.ref;
  const intB = statBases.int;
  const pickupPool = Math.max(0, Math.floor(refB + intB));
  const seenPickup = new Set<string>();
  let pickupSpent = 0;
  for (const row of pickup) {
    if (seenPickup.has(row.name)) {
      err.push(`Duplicate pickup skill "${row.name}".`);
      continue;
    }
    seenPickup.add(row.name);
    if (!PICKUP_NAME_SET.has(row.name)) {
      err.push(`"${row.name}" is not a valid pickup skill for this app.`);
    }
    if (careerNames.has(row.name)) {
      err.push(`Pickup skill "${row.name}" overlaps the career package.`);
    }
    const v = row.value;
    if (!Number.isFinite(v) || v < 0 || v > 10) {
      err.push(`Pickup "${row.name}" must be between 0 and 10.`);
    } else {
      pickupSpent += v;
    }
  }
  if (pickupSpent > pickupPool) {
    err.push(`Pickup skills spend ${pickupSpent} points but REF+INT allows ${pickupPool}.`);
  }

  if (!Number.isFinite(input.eurobucks) || input.eurobucks < 0) {
    err.push('Starting eurobucks must be a non-negative number.');
  }

  return err;
}

function careerSkillsFromFixedValues(
  role: RoleType,
  valuesByName: Record<string, number>,
): { skills: Skill[]; specialValue: number } {
  const pack = ROLE_CAREER_PACKAGES[role];
  const specialName = ROLE_SPECIAL_ABILITIES[role];
  const skills: Skill[] = pack.map((name) => {
    const isSpecial = name === specialName;
    const st = linkedStatForSkill(name, role, isSpecial);
    return {
      id: crypto.randomUUID(),
      name,
      value: valuesByName[name] ?? 0,
      linkedStat: st,
      category: skillCategory(st),
      isChipped: false,
      ...(isSpecial ? { isSpecialAbility: true } : {}),
    };
  });
  return { skills, specialValue: valuesByName[specialName] ?? 0 };
}

function pickupSkillsFromFixed(entries: { name: string; value: number }[]): Skill[] {
  return entries
    .filter((e) => e.value > 0)
    .map(({ name, value }) => {
      const st = SKILL_LINKED_STAT[name] ?? 'int';
      return {
        id: crypto.randomUUID(),
        name,
        value,
        linkedStat: st,
        category: skillCategory(st),
        isChipped: false,
      };
    });
}

/** Build a recalculated Character from a validated chargen draft (wizard submit). */
export function buildCp2020CharacterFromChargen(input: Cp2020ChargenBuildInput): Character {
  const errors = validateCp2020Chargen(input);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const kind = input.kind ?? 'character';
  const userId = kind === 'npc' ? '' : (input.userId ?? '');
  const { skills: careerSkills, specialValue } = careerSkillsFromFixedValues(input.role, input.careerValuesByName);
  const pickupSkills = pickupSkillsFromFixed(input.pickup);
  const allSkills = [...careerSkills, ...pickupSkills];

  const stats: Stats = {
    int: createStatBlock(input.statBases.int),
    ref: createStatBlock(input.statBases.ref),
    tech: createStatBlock(input.statBases.tech),
    cool: createStatBlock(input.statBases.cool),
    attr: createStatBlock(input.statBases.attr),
    luck: createStatBlock(input.statBases.luck),
    ma: createStatBlock(input.statBases.ma),
    bt: createStatBlock(input.statBases.bt),
    emp: createStatBlock(input.statBases.emp),
  };

  const typ: Character['type'] = kind === 'npc' ? 'npc' : 'character';
  const raw: Character = {
    id: crypto.randomUUID(),
    userId,
    sessionId: input.sessionId,
    name: input.name,
    type: typ,
    isNpc: typ === 'npc',
    team: typ === 'npc' ? 'hostile' : 'party',
    imageUrl: '',
    role: input.role,
    age: input.age,
    points: input.points,
    stats,
    specialAbility: { name: ROLE_SPECIAL_ABILITIES[input.role], value: specialValue },
    reputation: 0,
    improvementPoints: 0,
    skills: allSkills,
    damage: 0,
    isStunned: false,
    isStabilized: false,
    conditions: [],
    hitLocations: DEFAULT_HIT_LOCATIONS,
    sdp: {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks: Math.floor(input.eurobucks),
    items: [],
    combatModifiers: { initiative: 0, stunSave: 0 },
    netrunDeck: null,
    lifepath: null,
  };

  return recalcCharacterForGm(raw);
}

export const ALL_ROLES: RoleType[] = [
  'Solo',
  'Rockerboy',
  'Netrunner',
  'Media',
  'Nomad',
  'Fixer',
  'Cop',
  'Corp',
  'Techie',
  'Medtechie',
];

export function randomRole(rng: Cp2020Rng): RoleType {
  return ALL_ROLES[Math.floor(rng() * ALL_ROLES.length)];
}
