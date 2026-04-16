/**
 * Map Supabase snake_case rows to app TypeScript models.
 */

import type { Character, CharacterCondition, ChatMessage, RoleType, Scene, SessionSettings, Stats, StatBlock, Token } from '../types';
import { createStatBlock } from '../types';

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
  return {
    ttsEnabled: typeof o.ttsEnabled === 'boolean' ? o.ttsEnabled : DEFAULT_SETTINGS.ttsEnabled,
    ttsVoice: str(o.ttsVoice, DEFAULT_SETTINGS.ttsVoice),
    autoRollDamage:
      typeof o.autoRollDamage === 'boolean' ? o.autoRollDamage : DEFAULT_SETTINGS.autoRollDamage,
    allowPlayerTokenMovement:
      typeof o.allowPlayerTokenMovement === 'boolean'
        ? o.allowPlayerTokenMovement
        : DEFAULT_SETTINGS.allowPlayerTokenMovement,
  };
}

export function characterRowToCharacter(row: Record<string, unknown>): Character {
  const role = str(row.role, 'Solo') as RoleType;

  return {
    id: str(row.id),
    userId: row.user_id != null ? str(row.user_id) : '',
    sessionId: str(row.session_id),
    name: str(row.name),
    type: row.type === 'npc' ? 'npc' : 'character',
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
    conditions: safeConditions(row.conditions),
    hitLocations: (row.hit_locations as Character['hitLocations']) ?? ({} as Character['hitLocations']),
    sdp: (row.sdp as Character['sdp']) ?? {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks: num(row.eurobucks, 0),
    items: Array.isArray(row.items) ? (row.items as Character['items']) : [],
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
