/**
 * CP2020 "Fast Character System" NPCs (Cyberpunk 2020 core rules, p.30 / Fast and Dirty Expendables).
 * Stats from 2D6 per stat (reroll 11+), career package 40 pts, optional advanced pickup (2D10 among 5 skills),
 * armor & weapons from the NPC d10 + role modifier table.
 */

import { recalcCharacterForGm } from '@/lib/gm/character-mutations';
import {
  distributeCareerSkills,
  rollD6,
  rollD10,
  type Cp2020Rng,
} from '@/lib/character-gen/cp2020-char-gen';
import type { Armor, Character, RoleType, Skill, Stats, Weapon } from '@/lib/types';
import { ROLE_SPECIAL_ABILITIES } from '@/lib/types';
import { createStatBlock } from '@/lib/types';

const STAT_ORDER: Array<keyof Stats> = ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'];

export type FastNpcThreat = 'mook' | 'average' | 'capable' | 'elite';

const THREAT_DELTA: Record<FastNpcThreat, number> = {
  mook: -1,
  average: 0,
  capable: 1,
  elite: 2,
};

/** p.30 armor & weapon table: d10 + role modifier (clamped 1–10). */
export function armorWeaponTableIndex(role: RoleType, rng: Cp2020Rng): number {
  const mod =
    role === 'Solo'
      ? 3
      : role === 'Nomad' || role === 'Cop'
        ? 2
        : 0;
  return Math.max(1, Math.min(10, rollD10(rng) + mod));
}

function rollStat2d6(rng: Cp2020Rng): number {
  let v = rollD6(rng) + rollD6(rng);
  while (v >= 11) {
    v = rollD6(rng) + rollD6(rng);
  }
  return v;
}

function armorFromTableIndex(idx: number): { name: string; armor: Armor } {
  const id = crypto.randomUUID();
  const baseItem = {
    id,
    type: 'armor' as const,
    flavor: 'CP2020 Fast NPC table',
    notes: '',
    cost: 0,
    weight: 2,
    equipped: true,
    source: 'Fast NPC System',
  };

  const jacket = (name: string, torso: number, arms: number, legs: number): Armor => ({
    ...baseItem,
    name,
    coverage: {
      Head: { stoppingPower: 0, ablation: 0 },
      Torso: { stoppingPower: torso, ablation: 0 },
      rArm: { stoppingPower: arms, ablation: 0 },
      lArm: { stoppingPower: arms, ablation: 0 },
      rLeg: { stoppingPower: legs, ablation: 0 },
      lLeg: { stoppingPower: legs, ablation: 0 },
    },
    encumbrance: 2,
  });

  if (idx <= 1) return { name: 'Heavy Leather', armor: jacket('Heavy Leather', 4, 4, 0) };
  if (idx === 2) return { name: 'Armor Vest', armor: jacket('Armor Vest', 10, 0, 0) };
  if (idx <= 4) return { name: 'Light Armor Jacket', armor: jacket('Light Armor Jacket', 14, 14, 0) };
  if (idx <= 7) return { name: 'Medium Armor Jacket', armor: jacket('Medium Armor Jacket', 18, 18, 12) };
  if (idx <= 9) return { name: 'Heavy Armor Jacket', armor: jacket('Heavy Armor Jacket', 24, 24, 18) };
  return { name: 'MetalGear', armor: jacket('MetalGear', 25, 25, 25) };
}

function weaponFromTableIndex(idx: number, rng: Cp2020Rng): { name: string; weapon: Weapon } {
  const id = crypto.randomUUID();
  const base = {
    id,
    type: 'weapon' as const,
    flavor: 'CP2020 Fast NPC table',
    notes: '',
    cost: 0,
    weight: 1,
    equipped: true,
    source: 'Fast NPC System',
  };

  if (idx <= 1) {
    return {
      name: 'Knife',
      weapon: {
        ...base,
        name: 'Knife',
        weaponType: 'Melee' as const,
        accuracy: 0,
        concealability: 'P' as const,
        availability: 'E' as const,
        ammoType: '—',
        damage: '1d6+2',
        ap: false,
        shotsLeft: 0,
        shots: 0,
        rof: 0,
        reliability: 'ST' as const,
        range: 1,
        attackType: 'melee',
        attackSkill: 'Melee',
        isAutoCapable: false,
      },
    };
  }
  if (idx === 2) {
    return {
      name: 'Light Pistol',
      weapon: {
        ...base,
        name: 'Light Pistol',
        weaponType: 'Pistol' as const,
        accuracy: 0,
        concealability: 'J' as const,
        availability: 'E' as const,
        ammoType: '9mm',
        damage: '2d6+1',
        ap: false,
        shotsLeft: 10,
        shots: 10,
        rof: 2,
        reliability: 'ST' as const,
        range: 50,
        attackType: 'ranged',
        attackSkill: 'Handgun',
        isAutoCapable: false,
      },
    };
  }
  if (idx === 3) {
    return {
      name: 'Medium Pistol',
      weapon: {
        ...base,
        name: 'Medium Pistol',
        weaponType: 'Pistol' as const,
        accuracy: 0,
        concealability: 'J' as const,
        availability: 'E' as const,
        ammoType: '9mm',
        damage: '2d6+3',
        ap: false,
        shotsLeft: 10,
        shots: 10,
        rof: 2,
        reliability: 'ST' as const,
        range: 50,
        attackType: 'ranged',
        attackSkill: 'Handgun',
        isAutoCapable: false,
      },
    };
  }
  if (idx <= 5) {
    return {
      name: 'Heavy Pistol',
      weapon: {
        ...base,
        name: 'Heavy Pistol',
        weaponType: 'Pistol' as const,
        accuracy: -1,
        concealability: 'J' as const,
        availability: 'C' as const,
        ammoType: '.45',
        damage: '3d6',
        ap: false,
        shotsLeft: 8,
        shots: 8,
        rof: 2,
        reliability: 'ST' as const,
        range: 50,
        attackType: 'ranged',
        attackSkill: 'Handgun',
        isAutoCapable: false,
      },
    };
  }
  if (idx === 6) {
    return {
      name: 'Light SMG',
      weapon: {
        ...base,
        name: 'Light SMG',
        weaponType: 'SMG' as const,
        accuracy: 0,
        concealability: 'L' as const,
        availability: 'C' as const,
        ammoType: '9mm',
        damage: '2d6+3',
        ap: false,
        shotsLeft: 30,
        shots: 30,
        rof: 10,
        reliability: 'ST' as const,
        range: 150,
        attackType: 'ranged',
        attackSkill: 'Submachinegun',
        isAutoCapable: true,
      },
    };
  }
  if (idx === 7) {
    return {
      name: 'Light Assault Rifle',
      weapon: {
        ...base,
        name: 'Light Assault Rifle',
        weaponType: 'Rifle' as const,
        accuracy: 0,
        concealability: 'N' as const,
        availability: 'C' as const,
        ammoType: '5.56',
        damage: '4d6',
        ap: false,
        shotsLeft: 30,
        shots: 30,
        rof: 10,
        reliability: 'ST' as const,
        range: 400,
        attackType: 'ranged',
        attackSkill: 'Rifle',
        isAutoCapable: true,
      },
    };
  }
  if (idx === 8) {
    return {
      name: 'Medium Assault Rifle',
      weapon: {
        ...base,
        name: 'Medium Assault Rifle',
        weaponType: 'Rifle' as const,
        accuracy: 0,
        concealability: 'N' as const,
        availability: 'C' as const,
        ammoType: '5.56',
        damage: '5d6',
        ap: false,
        shotsLeft: 30,
        shots: 30,
        rof: 10,
        reliability: 'ST' as const,
        range: 400,
        attackType: 'ranged',
        attackSkill: 'Rifle',
        isAutoCapable: true,
      },
    };
  }
  void rng;
  return {
    name: 'Heavy Assault Rifle',
    weapon: {
      ...base,
      name: 'Heavy Assault Rifle',
      weaponType: 'Rifle' as const,
      accuracy: -1,
      concealability: 'N' as const,
      availability: 'R' as const,
      ammoType: '7.62',
      damage: '6d6',
      ap: false,
      shotsLeft: 30,
      shots: 30,
      rof: 10,
      reliability: 'ST' as const,
      range: 400,
      attackType: 'ranged',
      attackSkill: 'Rifle',
      isAutoCapable: true,
    },
  };
}

const PICKUP_SKILL_POOL = [
  'Dodge & Escape',
  'Stealth',
  'Driving',
  'First Aid',
  'Streetwise',
  'Intimidate',
  'Athletics',
  'Brawling',
  'Electronics',
  'Forgery',
] as const;

function shuffleArray<T>(arr: T[], rng: Cp2020Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function distributeAdvancedPickup(
  careerNames: Set<string>,
  totalPoints: number,
  rng: Cp2020Rng,
): Skill[] {
  const pool = PICKUP_SKILL_POOL.filter((n) => !careerNames.has(n));
  const shuffled = shuffleArray(pool, rng);
  const chosen = shuffled.slice(0, Math.min(5, pool.length));
  if (chosen.length === 0 || totalPoints <= 0) return [];

  const values = new Map<string, number>();
  for (const n of chosen) values.set(n, 0);
  let poolPts = totalPoints;
  let guard = poolPts * 20;
  while (poolPts > 0 && guard-- > 0) {
    const n = chosen[Math.floor(rng() * chosen.length)];
    const cur = values.get(n) ?? 0;
    if (cur < 10) {
      values.set(n, cur + 1);
      poolPts--;
    } else if (!chosen.some((c) => (values.get(c) ?? 0) < 10)) break;
  }

  const LINK: Record<string, keyof Stats> = {
    'Dodge & Escape': 'ref',
    Stealth: 'ref',
    Driving: 'ref',
    'First Aid': 'tech',
    Streetwise: 'cool',
    Intimidate: 'cool',
    Athletics: 'ref',
    Brawling: 'ref',
    Electronics: 'tech',
    Forgery: 'tech',
  };

  return chosen.map((name) => {
    const st = LINK[name] ?? 'ref';
    return {
      id: crypto.randomUUID(),
      name,
      value: values.get(name) ?? 0,
      linkedStat: st,
      category: String(st).toUpperCase(),
      isChipped: false,
    };
  });
}

function applyThreatToBases(bases: Record<keyof Stats, number>, threat: FastNpcThreat): void {
  const d = THREAT_DELTA[threat];
  if (d === 0) return;
  for (const k of STAT_ORDER) {
    bases[k] = Math.max(2, Math.min(10, bases[k] + d));
  }
}

const STAT_KEYS_FOR_OVERRIDE: Array<keyof Stats> = STAT_ORDER;

export function applyNpcStatOverrides(
  stats: Stats,
  overrides: Partial<Record<keyof Stats, number>> | undefined,
): void {
  if (!overrides) return;
  for (const k of STAT_KEYS_FOR_OVERRIDE) {
    const v = overrides[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const b = Math.max(2, Math.min(10, Math.floor(v)));
      stats[k] = createStatBlock(b, stats[k].tempMod);
    }
  }
}

export interface BuildFastSystemNpcInput {
  sessionId: string;
  name: string;
  role: RoleType;
  threat: FastNpcThreat;
  rng: Cp2020Rng;
  /** Optional per-stat overrides (2–10) applied after threat scaling. */
  statOverrides?: Partial<Record<keyof Stats, number>>;
  age?: number;
}

export interface FastSystemNpcResult {
  character: Character;
  gearSummary: string;
}

export function buildFastSystemNpc(input: BuildFastSystemNpcInput): FastSystemNpcResult {
  const { sessionId, name, role, threat, rng } = input;
  const bases = {} as Record<keyof Stats, number>;
  for (const k of STAT_ORDER) {
    bases[k] = rollStat2d6(rng);
  }
  applyThreatToBases(bases, threat);

  const stats: Stats = {
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

  applyNpcStatOverrides(stats, input.statOverrides);

  const points = STAT_ORDER.reduce((s, k) => s + stats[k].base, 0);

  const { skills: careerSkills, specialValue } = distributeCareerSkills(role, rng);
  const careerNames = new Set(careerSkills.map((s) => s.name));

  let extraSkills: Skill[] = [];
  if (threat === 'capable' || threat === 'elite') {
    const pickupPool = rollD10(rng) + rollD10(rng);
    extraSkills = distributeAdvancedPickup(careerNames, pickupPool, rng);
  }

  const tableIdx = armorWeaponTableIndex(role, rng);
  const { name: armorName, armor } = armorFromTableIndex(tableIdx);
  const { name: weaponName, weapon } = weaponFromTableIndex(tableIdx, rng);

  const eurobucks = (rollD6(rng) + rollD6(rng)) * 15;

  const raw: Character = {
    id: crypto.randomUUID(),
    userId: '',
    sessionId,
    name,
    type: 'npc',
    isNpc: true,
    imageUrl: '',
    role,
    age: input.age ?? 22 + rollD6(rng) + rollD6(rng) + rollD6(rng),
    points,
    stats,
    specialAbility: { name: ROLE_SPECIAL_ABILITIES[role], value: specialValue },
    reputation: 0,
    improvementPoints: 0,
    skills: [...careerSkills, ...extraSkills],
    damage: 0,
    isStunned: false,
    conditions: [],
    hitLocations: {
      Head: { location: [1], stoppingPower: 0, ablation: 0 },
      Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
      rArm: { location: [5], stoppingPower: 0, ablation: 0 },
      lArm: { location: [6], stoppingPower: 0, ablation: 0 },
      lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
      rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
    },
    sdp: {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks,
    items: [armor, weapon],
    combatModifiers: { initiative: 0, stunSave: 0 },
    netrunDeck: null,
    lifepath: null,
  };

  const character = recalcCharacterForGm(raw);
  return {
    character,
    gearSummary: `${armorName}; ${weaponName}`,
  };
}

/** Human-readable line for chat (task 19.3). */
export function formatNpcSpawnAnnouncement(c: Character, threat: string, gearSummary: string): string {
  return `A **${c.role}** — **${c.name}** appears (${threat} threat): ${gearSummary}.`;
}
