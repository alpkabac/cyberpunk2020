/**
 * Map Supabase snake_case rows to app TypeScript models.
 */

import type {
  Armor,
  Character,
  CharacterCondition,
  ChatMessage,
  Cyberware,
  Item,
  Program,
  RoleType,
  Scene,
  SessionSettings,
  Stats,
  StatBlock,
  Token,
  Vehicle,
  Weapon,
  WeaponType,
  Zone,
} from '../types';
import { createStatBlock } from '../types';
import { resolveCyberwareInitiativeFromRaw } from '../game-logic/cyberware-initiative-resolve';
import {
  MAP_GRID_DEFAULT_COLS,
  MAP_GRID_DEFAULT_ROWS,
  normalizeGridDimension,
} from '../map/grid';

const WEAPON_TYPES: WeaponType[] = ['Pistol', 'SMG', 'Shotgun', 'Rifle', 'Heavy', 'Melee', 'Exotic'];
const ZONES: Zone[] = ['Head', 'Torso', 'rArm', 'lArm', 'rLeg', 'lLeg'];

function newItemId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function parseWeaponType(v: unknown): WeaponType {
  const s = typeof v === 'string' ? v.trim() : '';
  return WEAPON_TYPES.includes(s as WeaponType) ? (s as WeaponType) : 'Exotic';
}

function parseConceal(v: unknown): Weapon['concealability'] {
  const s = typeof v === 'string' ? v : 'J';
  return ['P', 'J', 'L', 'N'].includes(s) ? (s as Weapon['concealability']) : 'J';
}

function parseAvail(v: unknown): Weapon['availability'] {
  const s = typeof v === 'string' ? v : 'E';
  return ['E', 'C', 'R', 'P'].includes(s) ? (s as Weapon['availability']) : 'E';
}

function parseRel(v: unknown): Weapon['reliability'] {
  const s = typeof v === 'string' ? v : 'ST';
  return ['VR', 'ST', 'UR'].includes(s) ? (s as Weapon['reliability']) : 'ST';
}

function normalizeZoneSp(raw: unknown): { stoppingPower: number; ablation: number } {
  if (!raw || typeof raw !== 'object') return { stoppingPower: 0, ablation: 0 };
  const o = raw as Record<string, unknown>;
  const sp = num(o.stoppingPower ?? o.stopping_power, 0);
  const ab = num(o.ablation, 0);
  return { stoppingPower: sp, ablation: ab };
}

/** Coerce JSONB / legacy rows into app Item shapes so Combat/Gear tabs recognize weapons & armor. */
export function normalizeCharacterItems(raw: unknown): Item[] {
  if (raw == null) return [];
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];

  const out: Item[] = [];
  for (const el of data) {
    const item = normalizeOneItem(el);
    if (item) out.push(item);
  }
  return out;
}

export function normalizeOneItem(entry: unknown): Item | null {
  if (!entry || typeof entry !== 'object') return null;
  const o = entry as Record<string, unknown>;

  const declared = typeof o.type === 'string' ? o.type.toLowerCase().trim() : '';
  const isKnown =
    declared === 'weapon' ||
    declared === 'armor' ||
    declared === 'cyberware' ||
    declared === 'vehicle' ||
    declared === 'program' ||
    declared === 'misc';

  let typeRaw: string = isKnown ? declared : '';
  if (!typeRaw) {
    if (o.weapon_type != null || o.weaponType != null) {
      typeRaw = 'weapon';
    } else if (typeof o.damage === 'string' && (o.rof != null || o.shots != null || o.accuracy != null)) {
      typeRaw = 'weapon';
    } else if (o.coverage != null && typeof o.coverage === 'object') {
      typeRaw = 'armor';
    } else if (o.cyberware_type != null || o.cyberwareType != null) {
      typeRaw = 'cyberware';
    } else if (o.vehicle_type != null || o.vehicleType != null) {
      typeRaw = 'vehicle';
    } else if (o.program_type != null || o.programType != null) {
      typeRaw = 'program';
    } else {
      typeRaw = 'misc';
    }
  }

  const base = {
    id: str(o.id, newItemId()),
    name: str(o.name, 'Item'),
    flavor: str(o.flavor, ''),
    notes: str(o.notes, ''),
    cost: num(o.cost, 0),
    weight: num(o.weight, 0),
    equipped: o.equipped !== false,
    source: str(o.source, ''),
  };

  if (typeRaw === 'weapon') {
    const w: Weapon = {
      ...base,
      type: 'weapon',
      weaponType: parseWeaponType(o.weaponType ?? o.weapon_type),
      accuracy: num(o.accuracy, 0),
      concealability: parseConceal(o.concealability),
      availability: parseAvail(o.availability),
      ammoType: str(o.ammoType ?? o.ammo_type, ''),
      damage: str(o.damage, '2d6'),
      ap: Boolean(o.ap),
      shotsLeft: num(o.shotsLeft ?? o.shots_left, num(o.shots, 0)),
      shots: num(o.shots, 0),
      rof: num(o.rof, 0),
      reliability: parseRel(o.reliability),
      range: num(o.range, 0),
      attackType: str(o.attackType ?? o.attack_type, 'ranged'),
      attackSkill: str(o.attackSkill ?? o.attack_skill, 'Handgun'),
      isAutoCapable: Boolean(o.isAutoCapable ?? o.is_auto_capable),
    };
    return w;
  }

  if (typeRaw === 'armor') {
    const covRaw = o.coverage;
    const coverage = {} as Armor['coverage'];
    if (covRaw && typeof covRaw === 'object') {
      const cr = covRaw as Record<string, unknown>;
      for (const z of ZONES) {
        const block = cr[z];
        coverage[z] = normalizeZoneSp(block);
      }
    } else {
      for (const z of ZONES) coverage[z] = { stoppingPower: 0, ablation: 0 };
    }
    const a: Armor = {
      ...base,
      type: 'armor',
      coverage,
      encumbrance: num(o.encumbrance, 0),
    };
    return a;
  }

  if (typeRaw === 'cyberware') {
    const cw: Cyberware = {
      ...base,
      type: 'cyberware',
      surgCode: str(o.surgCode ?? o.surg_code, 'M'),
      humanityCost: str(o.humanityCost ?? o.humanity_cost, ''),
      humanityLoss: num(o.humanityLoss ?? o.humanity_loss, 0),
      cyberwareType: str(o.cyberwareType ?? o.cyberware_type, 'implant'),
    };
    if (o.statMods && typeof o.statMods === 'object') cw.statMods = o.statMods as Cyberware['statMods'];
    if (o.stat_mods && typeof o.stat_mods === 'object') cw.statMods = o.stat_mods as Cyberware['statMods'];
    const iniBonus = resolveCyberwareInitiativeFromRaw(o as Record<string, unknown>);
    if (iniBonus !== 0) cw.initiativeBonus = iniBonus;
    return cw;
  }

  if (typeRaw === 'vehicle') {
    const v: Vehicle = {
      ...base,
      type: 'vehicle',
      vehicleType: str(o.vehicleType ?? o.vehicle_type, ''),
      topSpeed: num(o.topSpeed ?? o.top_speed, 0),
      acceleration: num(o.acceleration, 0),
      handling: num(o.handling, 0),
      vehicleArmor: num(o.vehicleArmor ?? o.vehicle_armor, 0),
      vehicleSdp: num(o.vehicleSdp ?? o.vehicle_sdp, 0),
    };
    return v;
  }

  if (typeRaw === 'program') {
    const p: Program = {
      ...base,
      type: 'program',
      programType: str(o.programType ?? o.program_type, ''),
      strength: num(o.strength, 0),
      muCost: num(o.muCost ?? o.mu_cost, 0),
      programClass: str(o.programClass ?? o.program_class, ''),
      options: Array.isArray(o.options) ? (o.options as string[]) : [],
    };
    return p;
  }

  return { ...base, type: 'misc' };
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function tsToMs(v: unknown): number {
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? Date.now() : t;
  }
  if (v instanceof Date) return v.getTime();
  return Date.now();
}

const STAT_KEYS: Array<keyof Stats> = ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'];

function safeStatBlock(v: unknown): StatBlock {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return {
      base: num(o.base, 1),
      tempMod: num(o.tempMod, 0),
      cyberMod: num(o.cyberMod, 0),
      armorMod: num(o.armorMod, 0),
      woundMod: num(o.woundMod, 0),
      total: num(o.total, num(o.base, 1) + num(o.tempMod, 0)),
    };
  }
  return createStatBlock(1, 0);
}

function safeStats(v: unknown): Stats {
  const raw = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out = {} as Record<keyof Stats, StatBlock>;
  for (const key of STAT_KEYS) {
    out[key] = safeStatBlock(raw[key]);
  }
  return out as Stats;
}

function safeConditions(v: unknown): CharacterCondition[] {
  if (!Array.isArray(v)) return [];
  return v.map((entry) => {
    if (typeof entry === 'string') return { name: entry, duration: null };
    if (entry && typeof entry === 'object') {
      const o = entry as Record<string, unknown>;
      return {
        name: typeof o.name === 'string' ? o.name : String(o.name ?? ''),
        duration: typeof o.duration === 'number' && Number.isFinite(o.duration) ? o.duration : null,
      };
    }
    return { name: String(entry), duration: null };
  }).filter((c) => c.name.length > 0);
}

const DEFAULT_SCENE: Scene = {
  location: '',
  description: '',
  npcsPresent: [],
  situation: '',
};

const DEFAULT_SETTINGS: SessionSettings = {
  ttsEnabled: true,
  ttsVoice: 'default',
  autoRollDamage: true,
  allowPlayerTokenMovement: true,
  voiceInputMode: 'pushToTalk',
  sessionRecordingStartedBy: null,
  mapGridCols: MAP_GRID_DEFAULT_COLS,
  mapGridRows: MAP_GRID_DEFAULT_ROWS,
  mapShowGrid: true,
  mapSnapToGrid: false,
  mapMetersPerSquare: 0,
};

export function parseSceneJson(v: unknown): Scene {
  if (!v || typeof v !== 'object') return { ...DEFAULT_SCENE };
  const o = v as Record<string, unknown>;
  return {
    location: str(o.location),
    description: str(o.description),
    npcsPresent: Array.isArray(o.npcsPresent) ? (o.npcsPresent as string[]) : [],
    situation: str(o.situation),
  };
}

export function parseSessionSettingsJson(v: unknown): SessionSettings {
  if (!v || typeof v !== 'object') return { ...DEFAULT_SETTINGS };
  const o = v as Record<string, unknown>;
  const voiceInputMode =
    o.voiceInputMode === 'session' || o.voiceInputMode === 'pushToTalk'
      ? o.voiceInputMode
      : DEFAULT_SETTINGS.voiceInputMode;
  const sessionRecordingStartedBy =
    o.sessionRecordingStartedBy === null || o.sessionRecordingStartedBy === undefined
      ? null
      : typeof o.sessionRecordingStartedBy === 'string'
        ? o.sessionRecordingStartedBy
        : DEFAULT_SETTINGS.sessionRecordingStartedBy;

  const mapMetersRaw = o.mapMetersPerSquare;
  const mapMetersPerSquare =
    typeof mapMetersRaw === 'number' && Number.isFinite(mapMetersRaw)
      ? Math.max(0, mapMetersRaw)
      : DEFAULT_SETTINGS.mapMetersPerSquare;

  return {
    ttsEnabled: typeof o.ttsEnabled === 'boolean' ? o.ttsEnabled : DEFAULT_SETTINGS.ttsEnabled,
    ttsVoice: str(o.ttsVoice, DEFAULT_SETTINGS.ttsVoice),
    autoRollDamage:
      typeof o.autoRollDamage === 'boolean' ? o.autoRollDamage : DEFAULT_SETTINGS.autoRollDamage,
    allowPlayerTokenMovement:
      typeof o.allowPlayerTokenMovement === 'boolean'
        ? o.allowPlayerTokenMovement
        : DEFAULT_SETTINGS.allowPlayerTokenMovement,
    voiceInputMode,
    sessionRecordingStartedBy,
    mapGridCols: normalizeGridDimension(
      typeof o.mapGridCols === 'number' ? o.mapGridCols : Number.NaN,
      DEFAULT_SETTINGS.mapGridCols,
    ),
    mapGridRows: normalizeGridDimension(
      typeof o.mapGridRows === 'number' ? o.mapGridRows : Number.NaN,
      DEFAULT_SETTINGS.mapGridRows,
    ),
    mapShowGrid: typeof o.mapShowGrid === 'boolean' ? o.mapShowGrid : DEFAULT_SETTINGS.mapShowGrid,
    mapSnapToGrid: typeof o.mapSnapToGrid === 'boolean' ? o.mapSnapToGrid : DEFAULT_SETTINGS.mapSnapToGrid,
    mapMetersPerSquare,
  };
}

/**
 * Merge a possibly partial Realtime/Postgres row into an existing character.
 * Without this, UPDATE replicas that omit unchanged JSON columns would map to
 * empty skills/items and wipe the sheet.
 */
export function mergeCharacterRowWithRealtime(existing: Character, row: Record<string, unknown>): Character {
  const incoming = characterRowToCharacter(row);
  const out: Character = { ...existing, ...incoming };
  if (!('items' in row)) out.items = existing.items;
  if (!('skills' in row)) out.skills = existing.skills;
  if (!('stats' in row)) out.stats = existing.stats;
  if (!('hit_locations' in row)) out.hitLocations = existing.hitLocations;
  if (!('special_ability' in row)) out.specialAbility = existing.specialAbility;
  if (!('conditions' in row)) out.conditions = existing.conditions;
  if (!('sdp' in row)) out.sdp = existing.sdp;
  if (!('netrun_deck' in row)) out.netrunDeck = existing.netrunDeck;
  if (!('lifepath' in row)) out.lifepath = existing.lifepath;
  if (!('combat_modifiers' in row)) out.combatModifiers = existing.combatModifiers;
  if (!('team' in row)) out.team = existing.team;
  return out;
}

export function characterRowToCharacter(row: Record<string, unknown>): Character {
  const role = str(row.role, 'Solo') as RoleType;

  const typ: Character['type'] = row.type === 'npc' ? 'npc' : 'character';
  return {
    id: str(row.id),
    userId: row.user_id != null ? str(row.user_id) : '',
    sessionId: str(row.session_id),
    name: str(row.name),
    type: typ,
    isNpc: typ === 'npc',
    team: typeof row.team === 'string' ? row.team : '',
    imageUrl: str(row.image_url),
    role,
    age: num(row.age, 25),
    points: num(row.points, 0),
    stats: safeStats(row.stats),
    specialAbility: (row.special_ability as Character['specialAbility']) ?? { name: '', value: 0 },
    reputation: num(row.reputation, 0),
    improvementPoints: num(row.improvement_points, 0),
    skills: Array.isArray(row.skills) ? (row.skills as Character['skills']) : [],
    damage: num(row.damage, 0),
    isStunned: Boolean(row.is_stunned),
    isStabilized: Boolean(row.is_stabilized),
    conditions: safeConditions(row.conditions),
    hitLocations: (row.hit_locations as Character['hitLocations']) ?? ({} as Character['hitLocations']),
    sdp: (row.sdp as Character['sdp']) ?? {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks: num(row.eurobucks, 0),
    items: normalizeCharacterItems(row.items),
    combatModifiers: row.combat_modifiers as Character['combatModifiers'] | undefined,
    netrunDeck: (row.netrun_deck as Character['netrunDeck']) ?? null,
    lifepath: (row.lifepath as Character['lifepath']) ?? null,
  };
}

export function tokenRowToToken(row: Record<string, unknown>): Token {
  const controlled = str(row.controlled_by, 'player');
  return {
    id: str(row.id),
    name: str(row.name),
    imageUrl: str(row.image_url),
    x: num(row.x, 0),
    y: num(row.y, 0),
    size: num(row.size, 50),
    controlledBy: controlled === 'gm' ? 'gm' : 'player',
    characterId: row.character_id != null ? str(row.character_id) : null,
  };
}

export function chatRowToMessage(row: Record<string, unknown>): ChatMessage {
  const t = str(row.type, 'player');
  const type: ChatMessage['type'] =
    t === 'narration' || t === 'player' || t === 'system' || t === 'roll' ? t : 'player';
  return {
    id: str(row.id),
    speaker: str(row.speaker),
    text: str(row.text),
    timestamp: tsToMs(row.created_at),
    type,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : undefined,
  };
}
