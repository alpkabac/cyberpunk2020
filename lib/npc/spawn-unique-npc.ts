/**
 * GM-authored “unique” NPCs: explicit stats, special ability, custom skills, and items (incl. weapons/armor/cyberware).
 */

import { recalcCharacterForGm } from '@/lib/gm/character-mutations';
import type {
  Armor,
  Availability,
  Character,
  CharacterItem,
  Concealability,
  Cyberware,
  MiscItem,
  Program,
  Reliability,
  RoleType,
  Skill,
  Stats,
  Vehicle,
  Weapon,
  WeaponType,
} from '@/lib/types';
import { createStatBlock } from '@/lib/types';

const STAT_KEYS: Array<keyof Stats> = ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'];

const WEAPON_TYPES: WeaponType[] = ['Pistol', 'SMG', 'Shotgun', 'Rifle', 'Heavy', 'Melee', 'Exotic'];

function clampStat(n: number): number {
  return Math.max(2, Math.min(10, Math.floor(n)));
}

function parseWeaponType(raw: unknown): WeaponType {
  if (typeof raw !== 'string') return 'Exotic';
  const u = raw.trim();
  return WEAPON_TYPES.includes(u as WeaponType) ? (u as WeaponType) : 'Exotic';
}

const CONC: Concealability[] = ['P', 'J', 'L', 'N'];
function parseConceal(raw: unknown): Concealability {
  return typeof raw === 'string' && CONC.includes(raw as Concealability) ? (raw as Concealability) : 'J';
}

const AVAIL: Availability[] = ['E', 'C', 'R', 'P'];
function parseAvail(raw: unknown): Availability {
  return typeof raw === 'string' && AVAIL.includes(raw as Availability) ? (raw as Availability) : 'E';
}

const REL: Reliability[] = ['VR', 'ST', 'UR'];
function parseRel(raw: unknown): Reliability {
  return typeof raw === 'string' && REL.includes(raw as Reliability) ? (raw as Reliability) : 'ST';
}

function numOr(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function strOr(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw : fallback;
}

/** Map GM tool item blobs into typed items (minimal weapon/armor/cyberware when details omitted). */
export function itemFromGmSpawnBlob(raw: Record<string, unknown>): CharacterItem | null {
  const id = typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID();
  const name = typeof raw.name === 'string' ? raw.name : 'Item';
  const typeStr = typeof raw.type === 'string' ? raw.type : 'misc';
  const flavor = typeof raw.flavor === 'string' ? raw.flavor : '';
  const notes = typeof raw.notes === 'string' ? raw.notes : '';
  const cost = numOr(raw.cost, 0);
  const weight = numOr(raw.weight, 0);
  const equipped = raw.equipped !== false;
  const source = typeof raw.source === 'string' ? raw.source : 'gm_unique_npc';

  if (typeStr === 'weapon') {
    const w: Weapon = {
      id,
      name,
      type: 'weapon',
      flavor,
      notes,
      cost,
      weight,
      equipped,
      source,
      weaponType: parseWeaponType(raw.weapon_type ?? raw.weaponType),
      accuracy: numOr(raw.accuracy, 0),
      concealability: parseConceal(raw.concealability),
      availability: parseAvail(raw.availability),
      ammoType: strOr(raw.ammo_type ?? raw.ammoType, '9mm'),
      damage: strOr(raw.damage, '2d6+3'),
      ap: raw.ap === true,
      shotsLeft: Math.max(0, Math.floor(numOr(raw.shots_left ?? raw.shotsLeft, 10))),
      shots: Math.max(0, Math.floor(numOr(raw.shots, 10))),
      rof: Math.max(0, Math.floor(numOr(raw.rof, 2))),
      reliability: parseRel(raw.reliability),
      range: Math.max(0, numOr(raw.range, 50)),
      attackType: strOr(raw.attack_type ?? raw.attackType, 'ranged'),
      attackSkill: strOr(raw.attack_skill ?? raw.attackSkill, 'Handgun'),
      isAutoCapable: raw.is_auto_capable === true || raw.isAutoCapable === true,
    };
    return w;
  }

  if (typeStr === 'armor') {
    const torso = Math.max(0, Math.floor(numOr(raw.torso_stopping_power ?? raw.torsoStoppingPower, 18)));
    const arms = Math.max(0, Math.floor(numOr(raw.arms_stopping_power ?? raw.armsStoppingPower, torso)));
    const legs = Math.max(0, Math.floor(numOr(raw.legs_stopping_power ?? raw.legsStoppingPower, 0)));
    const enc = Math.max(0, numOr(raw.encumbrance, 2));
    const a: Armor = {
      id,
      name,
      type: 'armor',
      flavor,
      notes,
      cost,
      weight,
      equipped,
      source,
      encumbrance: enc,
      coverage: {
        Head: { stoppingPower: 0, ablation: 0 },
        Torso: { stoppingPower: torso, ablation: 0 },
        rArm: { stoppingPower: arms, ablation: 0 },
        lArm: { stoppingPower: arms, ablation: 0 },
        rLeg: { stoppingPower: legs, ablation: 0 },
        lLeg: { stoppingPower: legs, ablation: 0 },
      },
    };
    return a;
  }

  if (typeStr === 'cyberware') {
    const cw: Cyberware = {
      id,
      name,
      type: 'cyberware',
      flavor,
      notes,
      cost,
      weight,
      equipped,
      source,
      surgCode: strOr(raw.surg_code ?? raw.surgCode, 'M'),
      humanityCost: strOr(raw.humanity_cost ?? raw.humanityCost, '—'),
      humanityLoss: Math.max(0, numOr(raw.humanity_loss ?? raw.humanityLoss, 0)),
      cyberwareType: strOr(raw.cyberware_type ?? raw.cyberwareType, 'cyberware'),
    };
    if (raw.stat_mods && typeof raw.stat_mods === 'object' && !Array.isArray(raw.stat_mods)) {
      const sm: Partial<Record<keyof Stats, number>> = {};
      for (const k of STAT_KEYS) {
        const v = (raw.stat_mods as Record<string, unknown>)[k];
        if (typeof v === 'number' && Number.isFinite(v)) sm[k] = v;
      }
      if (Object.keys(sm).length) cw.statMods = sm;
    }
    return cw;
  }

  if (typeStr === 'vehicle') {
    const v: Vehicle = {
      id,
      name,
      type: 'vehicle',
      flavor,
      notes,
      cost,
      weight,
      equipped,
      source,
      vehicleType: strOr(raw.vehicle_type ?? raw.vehicleType, ''),
      topSpeed: numOr(raw.top_speed ?? raw.topSpeed, 0),
      acceleration: numOr(raw.acceleration, 0),
      handling: numOr(raw.handling, 0),
      vehicleArmor: numOr(raw.vehicle_armor ?? raw.vehicleArmor, 0),
      vehicleSdp: numOr(raw.vehicle_sdp ?? raw.vehicleSdp, 0),
    };
    return v;
  }

  if (typeStr === 'program') {
    const p: Program = {
      id,
      name,
      type: 'program',
      flavor,
      notes,
      cost,
      weight,
      equipped,
      source,
      programType: strOr(raw.program_type ?? raw.programType, ''),
      strength: numOr(raw.strength, 0),
      muCost: numOr(raw.mu_cost ?? raw.muCost, 0),
      programClass: strOr(raw.program_class ?? raw.programClass, ''),
      options: Array.isArray(raw.options) ? (raw.options as string[]) : [],
    };
    return p;
  }

  if (typeStr === 'misc') {
    const m: MiscItem = {
      id,
      name,
      type: 'misc',
      flavor,
      notes,
      cost,
      weight,
      equipped,
      source,
    };
    return m;
  }

  return null;
}

export interface UniqueGmSkillInput {
  name: string;
  value: number;
  linkedStat?: keyof Stats;
  category?: string;
  isChipped?: boolean;
  isSpecialAbility?: boolean;
}

export interface BuildUniqueGmNpcInput {
  sessionId: string;
  name: string;
  role: RoleType;
  stats: Partial<Record<keyof Stats, number>>;
  specialAbility: { name: string; value: number };
  skills: UniqueGmSkillInput[];
  items: Record<string, unknown>[];
  age: number;
  reputation: number;
  improvementPoints: number;
  eurobucks: number;
  damage: number;
  imageUrl: string;
  combatModifiers?: Character['combatModifiers'];
  /** Tactical team id; default hostile. */
  team?: string;
}

const EMPTY_HIT: Character['hitLocations'] = {
  Head: { location: [1], stoppingPower: 0, ablation: 0 },
  Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
  rArm: { location: [5], stoppingPower: 0, ablation: 0 },
  lArm: { location: [6], stoppingPower: 0, ablation: 0 },
  lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
  rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
};

export function buildUniqueGmNpc(input: BuildUniqueGmNpcInput): Character {
  const teamId = (input.team ?? '').trim() || 'hostile';
  const defaultStat = 6;
  const stats: Stats = {} as Stats;
  for (const k of STAT_KEYS) {
    const v = input.stats[k];
    const base = typeof v === 'number' && Number.isFinite(v) ? clampStat(v) : defaultStat;
    stats[k] = createStatBlock(base);
  }

  const skills: Skill[] = input.skills.map((s) => ({
    id: crypto.randomUUID(),
    name: s.name,
    value: Math.max(0, Math.min(10, Math.floor(s.value))),
    linkedStat: s.linkedStat && STAT_KEYS.includes(s.linkedStat) ? s.linkedStat : 'ref',
    category: typeof s.category === 'string' && s.category.trim() ? s.category.trim() : 'Custom',
    isChipped: s.isChipped === true,
    isSpecialAbility: s.isSpecialAbility === true,
  }));

  const items: CharacterItem[] = [];
  for (const blob of input.items) {
    const it = itemFromGmSpawnBlob(blob);
    if (it) items.push(it);
  }

  const points = STAT_KEYS.reduce((sum, k) => sum + stats[k].base, 0);

  const raw: Character = {
    id: crypto.randomUUID(),
    userId: '',
    sessionId: input.sessionId,
    name: input.name,
    type: 'npc',
    isNpc: true,
    team: teamId,
    imageUrl: input.imageUrl,
    role: input.role,
    age: input.age,
    points,
    stats,
    specialAbility: {
      name: input.specialAbility.name,
      value: Math.max(0, Math.min(10, Math.floor(input.specialAbility.value))),
    },
    reputation: input.reputation,
    improvementPoints: input.improvementPoints,
    skills,
    damage: Math.max(0, Math.min(41, Math.floor(input.damage))),
    isStunned: false,
    isStabilized: false,
    conditions: [],
    hitLocations: { ...EMPTY_HIT },
    sdp: {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks: Math.max(0, Math.floor(input.eurobucks)),
    items,
    combatModifiers: input.combatModifiers ?? { initiative: 0, stunSave: 0 },
    netrunDeck: null,
    lifepath: null,
  };

  return recalcCharacterForGm(raw);
}

export function formatUniqueNpcAnnouncement(c: Character): string {
  const gear = c.items.length ? c.items.map((i) => i.name).join(', ') : 'no gear listed';
  return `**${c.name}** (${c.role}) enters play — custom sheet; gear: ${gear}.`;
}
