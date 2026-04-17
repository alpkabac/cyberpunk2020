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

const CINEMATIC_PRESETS: Record<string, number> = {
  average: 50,
  minor_supporting: 60,
  minor_hero: 75,
  major_supporting: 70,
  major_hero: 80,
};

/** Cinematic / Ref-chosen point budgets (p.25). */
export function cinematicCharacterPoints(preset: keyof typeof CINEMATIC_PRESETS | number): number {
  if (typeof preset === 'number' && Number.isFinite(preset)) {
    return Math.max(18, Math.min(90, Math.floor(preset)));
  }
  return CINEMATIC_PRESETS[preset] ?? 50;
}

const STAT_KEYS: Array<keyof Stats> = ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'];

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

const PICKUP_POOL: string[] = [
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
  cinematicPreset?: keyof typeof CINEMATIC_PRESETS | number;
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
  cinematic?: keyof typeof CINEMATIC_PRESETS | number,
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
