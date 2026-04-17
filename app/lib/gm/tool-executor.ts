/**
 * GM tool execution: validation + Supabase mutations (Requirements 3.2, 3.3, 3.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character, ChatMessage, RoleType, Stats, Zone } from '../types';
import { saveCharacterToSupabase, serializeCharacterForDb } from '../db/character-serialize';
import { characterRowToCharacter, normalizeOneItem, parseSceneJson } from '../realtime/db-mapper';
import { ALL_ROLES, createCryptoRng, randomRole } from '../character-gen/cp2020-char-gen';
import {
  buildFastSystemNpc,
  formatNpcSpawnAnnouncement,
  type FastNpcThreat,
} from '../npc/cp2020-fast-npc';
import {
  buildUniqueGmNpc,
  formatUniqueNpcAnnouncement,
  type UniqueGmSkillInput,
} from '../npc/spawn-unique-npc';
import {
  applyGmAddItem,
  applyGmAddMoney,
  applyGmDamage,
  applyGmDeductMoney,
  applyGmEquipItem,
  applyGmFieldUpdate,
  applyGmAdjustImprovementPoints,
  applyGmHealDamage,
  applyGmModifySkill,
  applyGmRemoveItem,
  applyGmSetCondition,
  applyGmUpdateAmmo,
} from './character-mutations';
import { rollDice } from '../game-logic/dice';
import { resolveGmRequestRollForServer } from '../game-logic/resolve-gm-request-roll';
import type { LoreRule } from './lorebook';
import { lookupRulesText } from './lorebook';

const ZONES: Zone[] = ['Head', 'Torso', 'rArm', 'lArm', 'lLeg', 'rLeg'];

export type GmToolName =
  | 'apply_damage'
  | 'deduct_money'
  | 'add_item'
  | 'remove_item'
  | 'request_roll'
  | 'move_token'
  | 'add_token'
  | 'remove_token'
  | 'generate_scenery'
  | 'play_narration'
  | 'lookup_rules'
  | 'update_character_field'
  | 'add_money'
  | 'heal_damage'
  | 'roll_dice'
  | 'equip_item'
  | 'modify_skill'
  | 'adjust_improvement_points'
  | 'update_ammo'
  | 'set_condition'
  | 'update_summary'
  | 'spawn_npc'
  | 'spawn_random_npc'
  | 'spawn_unique_npc'
  | 'add_chat_as_npc';

export interface ToolExecutorContext {
  supabase: SupabaseClient;
  sessionId: string;
  loreRules: LoreRule[];
  /** Authoritative character state; updated as tools run */
  charactersById: Map<string, Character>;
}

export type ToolExecutionSuccess = { ok: true; name: string; result: unknown };
export type ToolExecutionFailure = { ok: false; name: string; error: string };
export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown, field: string): string | { error: string } {
  if (typeof v === 'string' && v.trim() !== '') return v;
  return { error: `Invalid or missing string: ${field}` };
}

function num(v: unknown, field: string): number | { error: string } {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return { error: `Invalid number: ${field}` };
}

function optBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  return undefined;
}

function optStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  return undefined;
}

const STAT_KEYS_FOR_GM = new Set<string>(['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp']);

function validateFastSpawnNpcArgs(raw: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  if (raw.name !== undefined && raw.name !== null && typeof raw.name !== 'string') {
    return { ok: false, error: 'name must be a string if provided' };
  }
  if (raw.role !== undefined && raw.role !== null) {
    if (typeof raw.role !== 'string' || !ALL_ROLES.includes(raw.role as RoleType)) {
      return { ok: false, error: 'role must be a valid CP2020 role if provided' };
    }
  }
  if (raw.threat !== undefined && raw.threat !== null) {
    const t = String(raw.threat).toLowerCase();
    if (!['mook', 'average', 'capable', 'elite'].includes(t)) {
      return { ok: false, error: 'threat must be mook, average, capable, or elite' };
    }
  }
  if (raw.place_token !== undefined && typeof raw.place_token !== 'boolean') {
    return { ok: false, error: 'place_token must be a boolean if provided' };
  }
  if (raw.announce !== undefined && typeof raw.announce !== 'boolean') {
    return { ok: false, error: 'announce must be a boolean if provided' };
  }
  if (raw.stat_overrides !== undefined && raw.stat_overrides !== null) {
    if (!isRecord(raw.stat_overrides)) return { ok: false, error: 'stat_overrides must be an object' };
    for (const [k, val] of Object.entries(raw.stat_overrides)) {
      if (!STAT_KEYS_FOR_GM.has(k)) return { ok: false, error: `stat_overrides: unknown key ${k}` };
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        return { ok: false, error: `stat_overrides.${k} must be a finite number` };
      }
      const n = Math.floor(val);
      if (n < 2 || n > 10) return { ok: false, error: `stat_overrides.${k} must be between 2 and 10` };
    }
  }
  return { ok: true };
}

/** Exported for property tests — validates shape before any DB work. */
export function validateGmToolParameters(name: string, raw: unknown): { ok: true; name: GmToolName; args: Record<string, unknown> } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'Tool arguments must be a JSON object' };

  switch (name as GmToolName) {
    case 'apply_damage': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const raw_damage = num(raw.raw_damage, 'raw_damage');
      if (typeof raw_damage !== 'number') return { ok: false, error: raw_damage.error };
      if (raw_damage < 0) return { ok: false, error: 'raw_damage must be non-negative' };
      if (raw.location !== undefined && raw.location !== null) {
        if (typeof raw.location !== 'string' || !ZONES.includes(raw.location as Zone)) {
          return { ok: false, error: 'location must be a valid zone or omitted' };
        }
      }
      return { ok: true, name: 'apply_damage', args: raw };
    }
    case 'deduct_money': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const amount = num(raw.amount, 'amount');
      if (typeof amount !== 'number') return { ok: false, error: amount.error };
      if (amount < 0 || !Number.isInteger(amount)) return { ok: false, error: 'amount must be a non-negative integer' };
      return { ok: true, name: 'deduct_money', args: raw };
    }
    case 'add_item': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      if (!isRecord(raw.item)) return { ok: false, error: 'item must be an object' };
      const itemName = str(raw.item.name, 'item.name');
      if (typeof itemName !== 'string') return { ok: false, error: itemName.error };
      const itemType = str(raw.item.type, 'item.type');
      if (typeof itemType !== 'string') return { ok: false, error: itemType.error };
      return { ok: true, name: 'add_item', args: raw };
    }
    case 'remove_item': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const item_id = str(raw.item_id, 'item_id');
      if (typeof item_id !== 'string') return { ok: false, error: item_id.error };
      return { ok: true, name: 'remove_item', args: raw };
    }
    case 'request_roll': {
      const rollKind = optStr(raw.roll_kind);
      if (!rollKind) {
        const formula = str(raw.formula, 'formula');
        if (typeof formula !== 'string') return { ok: false, error: formula.error };
        return { ok: true, name: 'request_roll', args: raw };
      }
      if (rollKind !== 'skill' && rollKind !== 'stat' && rollKind !== 'raw_formula') {
        return { ok: false, error: 'roll_kind must be skill, stat, or raw_formula' };
      }
      if (rollKind === 'raw_formula') {
        const formula = str(raw.formula, 'formula');
        if (typeof formula !== 'string') return { ok: false, error: formula.error };
        return { ok: true, name: 'request_roll', args: raw };
      }
      if (rollKind === 'skill') {
        const character_id = str(raw.character_id, 'character_id');
        const skill_id = str(raw.skill_id, 'skill_id');
        if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
        if (typeof skill_id !== 'string') return { ok: false, error: skill_id.error };
        return { ok: true, name: 'request_roll', args: raw };
      }
      const character_id = str(raw.character_id, 'character_id');
      const stat = str(raw.stat, 'stat');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      if (typeof stat !== 'string') return { ok: false, error: stat.error };
      const allowed = new Set(['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp']);
      if (!allowed.has(stat.toLowerCase())) {
        return { ok: false, error: 'stat must be a CP2020 stat key (int, ref, tech, …)' };
      }
      return { ok: true, name: 'request_roll', args: raw };
    }
    case 'move_token': {
      const token_id = str(raw.token_id, 'token_id');
      if (typeof token_id !== 'string') return { ok: false, error: token_id.error };
      const x = num(raw.x, 'x');
      const y = num(raw.y, 'y');
      if (typeof x !== 'number') return { ok: false, error: x.error };
      if (typeof y !== 'number') return { ok: false, error: y.error };
      if (x < 0 || x > 100 || y < 0 || y > 100) return { ok: false, error: 'x and y must be in 0–100' };
      return { ok: true, name: 'move_token', args: raw };
    }
    case 'add_token': {
      const name = str(raw.name, 'name');
      if (typeof name !== 'string') return { ok: false, error: name.error };
      const controlled =
        raw.controlled_by === 'player' || raw.controlled_by === 'gm' ? raw.controlled_by : 'gm';
      if (controlled === 'player') {
        const cid = str(raw.character_id, 'character_id');
        if (typeof cid !== 'string') return { ok: false, error: cid.error };
      }
      if (raw.x !== undefined && raw.x !== null) {
        const x = num(raw.x, 'x');
        if (typeof x !== 'number') return { ok: false, error: x.error };
        if (x < 0 || x > 100) return { ok: false, error: 'x must be in 0–100' };
      }
      if (raw.y !== undefined && raw.y !== null) {
        const y = num(raw.y, 'y');
        if (typeof y !== 'number') return { ok: false, error: y.error };
        if (y < 0 || y > 100) return { ok: false, error: 'y must be in 0–100' };
      }
      if (raw.size !== undefined && raw.size !== null) {
        const sz = num(raw.size, 'size');
        if (typeof sz !== 'number') return { ok: false, error: sz.error };
        if (sz < 20 || sz > 120) return { ok: false, error: 'size must be 20–120' };
      }
      return { ok: true, name: 'add_token', args: { ...raw, controlled_by: controlled } };
    }
    case 'remove_token': {
      const token_id = str(raw.token_id, 'token_id');
      if (typeof token_id !== 'string') return { ok: false, error: token_id.error };
      return { ok: true, name: 'remove_token', args: raw };
    }
    case 'generate_scenery': {
      if (raw.description === undefined && raw.situation === undefined && raw.location === undefined) {
        return { ok: false, error: 'Provide at least one of description, situation, location' };
      }
      return { ok: true, name: 'generate_scenery', args: raw };
    }
    case 'play_narration': {
      const text = str(raw.text, 'text');
      if (typeof text !== 'string') return { ok: false, error: text.error };
      return { ok: true, name: 'play_narration', args: raw };
    }
    case 'lookup_rules': {
      const query = str(raw.query, 'query');
      if (typeof query !== 'string') return { ok: false, error: query.error };
      return { ok: true, name: 'lookup_rules', args: raw };
    }
    case 'update_character_field': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const path = str(raw.path, 'path');
      if (typeof path !== 'string') return { ok: false, error: path.error };
      if (!path.includes('.')) {
        const simple = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(path);
        if (!simple) return { ok: false, error: 'path must be a simple field or dot path of safe segments' };
      } else {
        const parts = path.split('.');
        for (const p of parts) {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) {
            return { ok: false, error: 'Invalid path segment' };
          }
        }
      }
      if (!('value' in raw)) return { ok: false, error: 'value is required' };
      return { ok: true, name: 'update_character_field', args: raw };
    }
    case 'add_money': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const amount = num(raw.amount, 'amount');
      if (typeof amount !== 'number') return { ok: false, error: amount.error };
      if (amount < 0) return { ok: false, error: 'amount must be non-negative' };
      return { ok: true, name: 'add_money', args: raw };
    }
    case 'heal_damage': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const amount = num(raw.amount, 'amount');
      if (typeof amount !== 'number') return { ok: false, error: amount.error };
      if (amount < 1) return { ok: false, error: 'amount must be at least 1' };
      return { ok: true, name: 'heal_damage', args: raw };
    }
    case 'roll_dice': {
      const formula = str(raw.formula, 'formula');
      if (typeof formula !== 'string') return { ok: false, error: formula.error };
      return { ok: true, name: 'roll_dice', args: raw };
    }
    case 'equip_item': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const item_id = str(raw.item_id, 'item_id');
      if (typeof item_id !== 'string') return { ok: false, error: item_id.error };
      if (typeof raw.equipped !== 'boolean') return { ok: false, error: 'equipped must be a boolean' };
      return { ok: true, name: 'equip_item', args: raw };
    }
    case 'modify_skill': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const skill_name = str(raw.skill_name, 'skill_name');
      if (typeof skill_name !== 'string') return { ok: false, error: skill_name.error };
      const new_value = num(raw.new_value, 'new_value');
      if (typeof new_value !== 'number') return { ok: false, error: new_value.error };
      if (new_value < 0 || new_value > 10) return { ok: false, error: 'new_value must be 0–10' };
      return { ok: true, name: 'modify_skill', args: raw };
    }
    case 'adjust_improvement_points': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const delta = num(raw.delta, 'delta');
      if (typeof delta !== 'number') return { ok: false, error: delta.error };
      if (!Number.isFinite(delta) || Math.trunc(delta) !== delta) {
        return { ok: false, error: 'delta must be a finite integer' };
      }
      if (delta === 0) return { ok: false, error: 'delta must be non-zero' };
      const reason = str(raw.reason, 'reason');
      if (typeof reason !== 'string') return { ok: false, error: reason.error };
      if (reason.length > 500) return { ok: false, error: 'reason must be at most 500 characters' };
      return { ok: true, name: 'adjust_improvement_points', args: raw };
    }
    case 'update_ammo': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const weapon_id = str(raw.weapon_id, 'weapon_id');
      if (typeof weapon_id !== 'string') return { ok: false, error: weapon_id.error };
      const isReload = raw.reload === true;
      if (!isReload) {
        if (raw.shots_left === undefined || raw.shots_left === null) {
          return { ok: false, error: 'Either shots_left or reload:true is required' };
        }
        const sl = num(raw.shots_left, 'shots_left');
        if (typeof sl !== 'number') return { ok: false, error: sl.error };
        if (sl < 0) return { ok: false, error: 'shots_left must be non-negative' };
      }
      return { ok: true, name: 'update_ammo', args: raw };
    }
    case 'set_condition': {
      const character_id = str(raw.character_id, 'character_id');
      if (typeof character_id !== 'string') return { ok: false, error: character_id.error };
      const condition = str(raw.condition, 'condition');
      if (typeof condition !== 'string') return { ok: false, error: condition.error };
      if (typeof raw.active !== 'boolean') return { ok: false, error: 'active must be a boolean' };
      if (raw.duration_rounds !== undefined && raw.duration_rounds !== null) {
        if (typeof raw.duration_rounds !== 'number' || !Number.isInteger(raw.duration_rounds) || raw.duration_rounds < 1) {
          return { ok: false, error: 'duration_rounds must be a positive integer or omitted' };
        }
      }
      return { ok: true, name: 'set_condition', args: raw };
    }
    case 'update_summary': {
      const summary = str(raw.summary, 'summary');
      if (typeof summary !== 'string') return { ok: false, error: summary.error };
      return { ok: true, name: 'update_summary', args: raw };
    }
    case 'spawn_npc':
    case 'spawn_random_npc': {
      const v = validateFastSpawnNpcArgs(raw);
      if (!v.ok) return v;
      return { ok: true, name: name as GmToolName, args: raw };
    }
    case 'spawn_unique_npc': {
      const n = str(raw.name, 'name');
      if (typeof n !== 'string') return { ok: false, error: n.error };
      if (!n.trim()) return { ok: false, error: 'name must not be empty' };
      if (typeof raw.role !== 'string' || !ALL_ROLES.includes(raw.role as RoleType)) {
        return { ok: false, error: 'role must be a valid CP2020 role' };
      }
      if (!isRecord(raw.special_ability)) return { ok: false, error: 'special_ability must be an object' };
      const saName = str(raw.special_ability.name, 'special_ability.name');
      if (typeof saName !== 'string') return { ok: false, error: saName.error };
      if (!saName.trim()) return { ok: false, error: 'special_ability.name must not be empty' };
      const saVal = num(raw.special_ability.value, 'special_ability.value');
      if (typeof saVal !== 'number') return { ok: false, error: saVal.error };
      if (saVal < 0 || saVal > 10) return { ok: false, error: 'special_ability.value must be 0–10' };

      if (raw.stats !== undefined && raw.stats !== null) {
        if (!isRecord(raw.stats)) return { ok: false, error: 'stats must be an object' };
        for (const [k, val] of Object.entries(raw.stats)) {
          if (!STAT_KEYS_FOR_GM.has(k)) return { ok: false, error: `stats: unknown key ${k}` };
          if (typeof val !== 'number' || !Number.isFinite(val)) {
            return { ok: false, error: `stats.${k} must be a finite number` };
          }
          const sn = Math.floor(val);
          if (sn < 2 || sn > 10) return { ok: false, error: `stats.${k} must be between 2 and 10` };
        }
      }

      if (raw.skills !== undefined && raw.skills !== null) {
        if (!Array.isArray(raw.skills)) return { ok: false, error: 'skills must be an array' };
        for (let i = 0; i < raw.skills.length; i++) {
          const s = raw.skills[i];
          if (!isRecord(s)) return { ok: false, error: `skills[${i}] must be an object` };
          const snm = str(s.name, `skills[${i}].name`);
          if (typeof snm !== 'string') return { ok: false, error: snm.error };
          const sv = num(s.value, `skills[${i}].value`);
          if (typeof sv !== 'number') return { ok: false, error: sv.error };
          if (sv < 0 || sv > 10) return { ok: false, error: `skills[${i}].value must be 0–10` };
          if (s.linked_stat !== undefined && s.linked_stat !== null) {
            if (typeof s.linked_stat !== 'string' || !STAT_KEYS_FOR_GM.has(s.linked_stat)) {
              return { ok: false, error: `skills[${i}].linked_stat must be a stat key` };
            }
          }
          if (s.category !== undefined && s.category !== null && typeof s.category !== 'string') {
            return { ok: false, error: `skills[${i}].category must be a string` };
          }
          if (s.is_chipped !== undefined && typeof s.is_chipped !== 'boolean') {
            return { ok: false, error: `skills[${i}].is_chipped must be a boolean` };
          }
          if (s.is_special_ability !== undefined && typeof s.is_special_ability !== 'boolean') {
            return { ok: false, error: `skills[${i}].is_special_ability must be a boolean` };
          }
        }
      }

      if (raw.items !== undefined && raw.items !== null && !Array.isArray(raw.items)) {
        return { ok: false, error: 'items must be an array' };
      }
      if (raw.items !== undefined && raw.items !== null) {
        for (let i = 0; i < raw.items.length; i++) {
          if (!isRecord(raw.items[i])) return { ok: false, error: `items[${i}] must be an object` };
        }
      }

      if (raw.age !== undefined && raw.age !== null) {
        const a = num(raw.age, 'age');
        if (typeof a !== 'number') return { ok: false, error: a.error };
      }
      if (raw.reputation !== undefined && raw.reputation !== null) {
        const r = num(raw.reputation, 'reputation');
        if (typeof r !== 'number') return { ok: false, error: r.error };
      }
      if (raw.improvement_points !== undefined && raw.improvement_points !== null) {
        const ip = num(raw.improvement_points, 'improvement_points');
        if (typeof ip !== 'number') return { ok: false, error: ip.error };
      }
      if (raw.eurobucks !== undefined && raw.eurobucks !== null) {
        const e = num(raw.eurobucks, 'eurobucks');
        if (typeof e !== 'number') return { ok: false, error: e.error };
      }
      if (raw.damage !== undefined && raw.damage !== null) {
        const d = num(raw.damage, 'damage');
        if (typeof d !== 'number') return { ok: false, error: d.error };
        if (d < 0 || d > 41) return { ok: false, error: 'damage must be 0–41' };
      }
      if (raw.image_url !== undefined && raw.image_url !== null && typeof raw.image_url !== 'string') {
        return { ok: false, error: 'image_url must be a string' };
      }
      if (raw.announcement_text !== undefined && raw.announcement_text !== null && typeof raw.announcement_text !== 'string') {
        return { ok: false, error: 'announcement_text must be a string' };
      }
      if (raw.combat_modifiers !== undefined && raw.combat_modifiers !== null) {
        if (!isRecord(raw.combat_modifiers)) return { ok: false, error: 'combat_modifiers must be an object' };
        const cm = raw.combat_modifiers;
        if (cm.initiative !== undefined && (typeof cm.initiative !== 'number' || !Number.isFinite(cm.initiative))) {
          return { ok: false, error: 'combat_modifiers.initiative must be a number' };
        }
        const stun = cm.stun_save ?? cm.stunSave;
        if (stun !== undefined && (typeof stun !== 'number' || !Number.isFinite(stun))) {
          return { ok: false, error: 'combat_modifiers.stun_save must be a number' };
        }
      }
      if (raw.place_token !== undefined && typeof raw.place_token !== 'boolean') {
        return { ok: false, error: 'place_token must be a boolean if provided' };
      }
      if (raw.announce !== undefined && typeof raw.announce !== 'boolean') {
        return { ok: false, error: 'announce must be a boolean if provided' };
      }
      return { ok: true, name: 'spawn_unique_npc', args: raw };
    }
    case 'add_chat_as_npc': {
      const npc_name = str(raw.npc_name, 'npc_name');
      if (typeof npc_name !== 'string') return { ok: false, error: npc_name.error };
      const text = str(raw.text, 'text');
      if (typeof text !== 'string') return { ok: false, error: text.error };
      return { ok: true, name: 'add_chat_as_npc', args: raw };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

export function parseToolArgumentsJson(argsJson: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(argsJson) as unknown;
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

async function insertChatMessage(
  supabase: SupabaseClient,
  sessionId: string,
  speaker: string,
  text: string,
  type: ChatMessage['type'],
  metadata: Record<string, unknown> = {},
): Promise<Error | null> {
  const { error } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    speaker,
    text,
    type,
    metadata,
  });
  return error ? new Error(error.message) : null;
}

async function persistNewNpcWithOptionalToken(
  ctx: ToolExecutorContext,
  built: Character,
  placeToken: boolean,
  rng: () => number,
): Promise<
  { ok: true; saved: Character; token_id: string | null } | { ok: false; error: string }
> {
  const row = {
    id: built.id,
    session_id: ctx.sessionId,
    user_id: null,
    type: 'npc' as const,
    ...serializeCharacterForDb(built),
  };
  const { data, error } = await ctx.supabase.from('characters').insert(row).select('*').single();
  if (error) return { ok: false, error: error.message };
  const saved = characterRowToCharacter(data as Record<string, unknown>);
  ctx.charactersById.set(saved.id, saved);

  let token_id: string | null = null;
  if (placeToken) {
    const x = 15 + Math.floor(rng() * 70);
    const y = 15 + Math.floor(rng() * 70);
    const { data: tok, error: tokErr } = await ctx.supabase
      .from('tokens')
      .insert({
        session_id: ctx.sessionId,
        character_id: saved.id,
        name: saved.name,
        image_url: saved.imageUrl ?? '',
        x,
        y,
        size: 50,
        controlled_by: 'gm',
      })
      .select('id')
      .single();
    if (tokErr) return { ok: false, error: tokErr.message };
    token_id = typeof tok?.id === 'string' ? tok.id : null;
  }
  return { ok: true, saved, token_id };
}

export async function executeGmTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
): Promise<ToolExecutionResult> {
  const validated = validateGmToolParameters(name, args);
  if (!validated.ok) return { ok: false, name, error: validated.error };

  switch (validated.name) {
    case 'apply_damage': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const locRaw = args.location;
      const location: Zone | null =
        typeof locRaw === 'string' && ZONES.includes(locRaw as Zone) ? (locRaw as Zone) : null;
      const rawD = Number(args.raw_damage);
      const updated = applyGmDamage(
        c,
        rawD,
        location,
        optBool(args.is_ap) ?? false,
        optBool(args.point_blank) ?? false,
        optStr(args.weapon_damage_formula) ?? null,
      );
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, damage: updated.damage, woundState: updated.derivedStats?.woundState } };
    }
    case 'deduct_money': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const updated = applyGmDeductMoney(c, Number(args.amount));
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, eurobucks: updated.eurobucks } };
    }
    case 'add_item': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const rawItem = args.item as Record<string, unknown>;
      const itemId = typeof rawItem.id === 'string' && rawItem.id ? rawItem.id : crypto.randomUUID();
      const item = normalizeOneItem({ ...rawItem, id: itemId });
      if (!item) return { ok: false, name, error: 'Invalid item data' };
      const updated = applyGmAddItem(c, item);
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, item_id: item.id } };
    }
    case 'remove_item': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const itemId = String(args.item_id);
      const updated = applyGmRemoveItem(c, itemId);
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, removed: itemId } };
    }
    case 'request_roll': {
      const reason = optStr(args.reason) ?? '';
      const rollKind = optStr(args.roll_kind) ?? 'raw_formula';
      const characterId = optStr(args.character_id);
      const meta: Record<string, unknown> = {
        kind: 'roll_request',
        roll_kind: rollKind,
        reason,
        characterId: characterId ?? null,
      };
      if (rollKind === 'skill' && typeof args.skill_id === 'string') {
        meta.skill_id = args.skill_id;
      }
      if (rollKind === 'stat' && typeof args.stat === 'string') {
        meta.stat = args.stat.toLowerCase();
      }

      const c = characterId ? ctx.charactersById.get(characterId) : undefined;
      let formula = typeof args.formula === 'string' ? args.formula.trim() : '';
      if (c && (rollKind === 'skill' || rollKind === 'stat')) {
        const r = resolveGmRequestRollForServer(c, {
          roll_kind: rollKind,
          formula,
          skill_id: optStr(args.skill_id) ?? null,
          stat: optStr(args.stat) ?? null,
        });
        if (r.resolvedFromCharacter) {
          formula = r.formula;
        }
      }
      if (!formula.trim()) {
        formula = typeof args.formula === 'string' ? args.formula.trim() : '';
      }
      if (!formula.trim()) {
        return { ok: false, name, error: 'Could not resolve roll formula (check character_id, skill_id, stat, or formula)' };
      }
      meta.formula = formula.trim();

      const line = `Roll requested (${rollKind}): ${formula.trim()}${reason ? ` — ${reason}` : ''}`;
      const err = await insertChatMessage(ctx.supabase, ctx.sessionId, 'Game Master', line, 'system', meta);
      if (err) return { ok: false, name, error: err.message };
      return {
        ok: true,
        name,
        result: {
          formula: formula.trim(),
          roll_kind: rollKind,
          reason,
          character_id: characterId ?? null,
        },
      };
    }
    case 'move_token': {
      const tokenId = String(args.token_id);
      const x = Number(args.x);
      const y = Number(args.y);
      const { error } = await ctx.supabase
        .from('tokens')
        .update({ x, y })
        .eq('id', tokenId)
        .eq('session_id', ctx.sessionId);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { token_id: tokenId, x, y } };
    }
    case 'add_token': {
      const nm = String(args.name);
      const x = args.x !== undefined && args.x !== null ? Number(args.x) : 50;
      const y = args.y !== undefined && args.y !== null ? Number(args.y) : 50;
      const controlledBy = args.controlled_by === 'player' ? 'player' : 'gm';
      const characterId =
        controlledBy === 'player' && typeof args.character_id === 'string' && args.character_id.trim()
          ? String(args.character_id).trim()
          : null;
      const imageUrl = typeof args.image_url === 'string' ? args.image_url : '';
      const size =
        typeof args.size === 'number' && Number.isFinite(args.size)
          ? Math.max(20, Math.min(120, Math.floor(args.size)))
          : 50;
      const { data, error } = await ctx.supabase
        .from('tokens')
        .insert({
          session_id: ctx.sessionId,
          character_id: characterId,
          name: nm,
          image_url: imageUrl,
          x,
          y,
          size,
          controlled_by: controlledBy,
        })
        .select('id')
        .single();
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { token_id: data?.id, name: nm, x, y, controlled_by: controlledBy } };
    }
    case 'remove_token': {
      const tokenId = String(args.token_id);
      const { error } = await ctx.supabase.from('tokens').delete().eq('id', tokenId).eq('session_id', ctx.sessionId);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { token_id: tokenId, removed: true } };
    }
    case 'generate_scenery': {
      const { data: row, error: fetchErr } = await ctx.supabase
        .from('sessions')
        .select('active_scene')
        .eq('id', ctx.sessionId)
        .maybeSingle();
      if (fetchErr || !row) return { ok: false, name, error: fetchErr?.message ?? 'Session not found' };
      const current = parseSceneJson((row as { active_scene?: unknown }).active_scene);
      const next = {
        ...current,
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
        ...(typeof args.situation === 'string' ? { situation: args.situation } : {}),
        ...(typeof args.location === 'string' ? { location: args.location } : {}),
      };
      const { error } = await ctx.supabase.from('sessions').update({ active_scene: next }).eq('id', ctx.sessionId);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { active_scene: next } };
    }
    case 'play_narration': {
      const text = String(args.text);
      const err = await insertChatMessage(ctx.supabase, ctx.sessionId, 'Game Master', text, 'narration', {});
      if (err) return { ok: false, name, error: err.message };
      return { ok: true, name, result: { posted: true } };
    }
    case 'lookup_rules': {
      const query = String(args.query);
      const text = lookupRulesText(query, ctx.loreRules);
      return { ok: true, name, result: { text } };
    }
    case 'update_character_field': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const path = String(args.path);
      const updated = applyGmFieldUpdate(c, path, args.value);
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, path } };
    }
    case 'add_money': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const updated = applyGmAddMoney(c, Number(args.amount));
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, eurobucks: updated.eurobucks } };
    }
    case 'heal_damage': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const updated = applyGmHealDamage(c, Number(args.amount));
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, damage: updated.damage, woundState: updated.derivedStats?.woundState } };
    }
    case 'roll_dice': {
      const formula = String(args.formula);
      const reason = optStr(args.reason) ?? '';
      const characterId = optStr(args.character_id);
      const result = rollDice(formula);
      if (!result) return { ok: false, name, error: `Invalid dice formula: ${formula}` };
      const label = characterId
        ? `Roll (${formula})${reason ? ` — ${reason}` : ''}`
        : `Roll (${formula})${reason ? ` — ${reason}` : ''}`;
      const text = `${label}: **${result.total}** [${result.rolls.join(', ')}]${result.hadExplodingD10 ? ' (exploding!)' : ''}`;
      const err = await insertChatMessage(ctx.supabase, ctx.sessionId, 'Game Master', text, 'roll', {
        kind: 'gm_roll',
        formula,
        reason,
        total: result.total,
        rolls: result.rolls,
        hadExplodingD10: result.hadExplodingD10,
        characterId: characterId ?? null,
      });
      if (err) return { ok: false, name, error: err.message };
      return { ok: true, name, result: { formula, total: result.total, rolls: result.rolls, hadExplodingD10: result.hadExplodingD10 } };
    }
    case 'equip_item': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const updated = applyGmEquipItem(c, String(args.item_id), Boolean(args.equipped));
      if (!updated) return { ok: false, name, error: `Item not found: ${args.item_id}` };
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, item_id: args.item_id, equipped: args.equipped } };
    }
    case 'modify_skill': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const updated = applyGmModifySkill(c, String(args.skill_name), Number(args.new_value));
      if (!updated) return { ok: false, name, error: `Skill not found: ${args.skill_name}` };
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { character_id: id, skill_name: args.skill_name, new_value: args.new_value } };
    }
    case 'adjust_improvement_points': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const delta = Math.trunc(Number(args.delta));
      const reason = String(args.reason).trim();
      const before = c.improvementPoints;
      const updated = applyGmAdjustImprovementPoints(c, delta);
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      const sign = delta > 0 ? '+' : '';
      const line = `Improvement Points: **${updated.name}** ${sign}${delta} (${reason}). Total IP: **${updated.improvementPoints}**.`;
      const errChat = await insertChatMessage(ctx.supabase, ctx.sessionId, 'Game Master', line, 'system', {
        kind: 'improvement_points',
        character_id: id,
        delta,
        before,
        after: updated.improvementPoints,
        reason,
      });
      if (errChat) return { ok: false, name, error: errChat.message };
      return {
        ok: true,
        name,
        result: {
          character_id: id,
          improvement_points: updated.improvementPoints,
          delta,
        },
      };
    }
    case 'update_ammo': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const isReload = args.reload === true;
      const shotsLeft = typeof args.shots_left === 'number' ? args.shots_left : null;
      const updated = applyGmUpdateAmmo(c, String(args.weapon_id), shotsLeft, isReload);
      if (!updated) return { ok: false, name, error: `Weapon not found: ${args.weapon_id}` };
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };
      const weapon = updated.items.find((i) => i.id === String(args.weapon_id));
      return { ok: true, name, result: { character_id: id, weapon_id: args.weapon_id, shots_left: weapon ? (weapon as unknown as { shotsLeft: number }).shotsLeft : null } };
    }
    case 'set_condition': {
      const id = String(args.character_id);
      const c = ctx.charactersById.get(id);
      if (!c) return { ok: false, name, error: `Character not in session: ${id}` };
      const condition = String(args.condition).toLowerCase().trim();
      const active = Boolean(args.active);
      const durationRounds = typeof args.duration_rounds === 'number' && Number.isFinite(args.duration_rounds)
        ? Math.floor(args.duration_rounds)
        : null;

      let updated: Character;
      if (condition === 'stunned') {
        updated = applyGmFieldUpdate(c, 'isStunned', active);
      } else {
        updated = applyGmSetCondition(c, condition, active, durationRounds);
      }
      ctx.charactersById.set(id, updated);
      const { error } = await saveCharacterToSupabase(ctx.supabase, updated);
      if (error) return { ok: false, name, error: error.message };

      const verb = active ? 'applied to' : 'removed from';
      const durLabel = active && durationRounds ? ` (${durationRounds} rounds)` : '';
      const err = await insertChatMessage(
        ctx.supabase,
        ctx.sessionId,
        'Game Master',
        `Condition **${condition}** ${verb} ${c.name}${durLabel}.`,
        'system',
        { kind: 'condition_change', characterId: id, condition, active, duration_rounds: durationRounds },
      );
      if (err) return { ok: false, name, error: err.message };
      return { ok: true, name, result: { character_id: id, condition, active, duration_rounds: durationRounds, conditions: updated.conditions } };
    }
    case 'update_summary': {
      const summary = String(args.summary);
      const { error } = await ctx.supabase
        .from('sessions')
        .update({ session_summary: summary })
        .eq('id', ctx.sessionId);
      if (error) return { ok: false, name, error: error.message };
      return { ok: true, name, result: { updated: true } };
    }
    case 'spawn_npc':
    case 'spawn_random_npc': {
      const rng = createCryptoRng();
      const role: RoleType =
        typeof args.role === 'string' && ALL_ROLES.includes(args.role as RoleType)
          ? (args.role as RoleType)
          : randomRole(rng);
      const threatRaw = (typeof args.threat === 'string' ? args.threat : 'average').toLowerCase() as FastNpcThreat;
      const baseName =
        typeof args.name === 'string' && args.name.trim() !== ''
          ? args.name.trim()
          : `NPC ${role}-${Math.floor(rng() * 900 + 100)}`;
      const placeToken = args.place_token !== false;
      const doAnnounce = args.announce !== false;

      const statOverrides =
        args.stat_overrides && isRecord(args.stat_overrides)
          ? (args.stat_overrides as Partial<Record<keyof Stats, number>>)
          : undefined;

      const { character: built, gearSummary } = buildFastSystemNpc({
        sessionId: ctx.sessionId,
        name: baseName,
        role,
        threat: threatRaw,
        rng,
        statOverrides,
      });

      const persisted = await persistNewNpcWithOptionalToken(ctx, built, placeToken, rng);
      if (!persisted.ok) return { ok: false, name, error: persisted.error };
      const { saved, token_id } = persisted;

      if (doAnnounce) {
        const line = formatNpcSpawnAnnouncement(saved, threatRaw, gearSummary);
        const errAnn = await insertChatMessage(ctx.supabase, ctx.sessionId, 'Game Master', line, 'system', {
          kind: 'npc_spawn',
          character_id: saved.id,
          threat: threatRaw,
        });
        if (errAnn) return { ok: false, name, error: errAnn.message };
      }

      return {
        ok: true,
        name: validated.name,
        result: {
          character_id: saved.id,
          name: saved.name,
          role: saved.role,
          threat: threatRaw,
          gear_summary: gearSummary,
          token_id,
        },
      };
    }
    case 'spawn_unique_npc': {
      const rng = createCryptoRng();
      const role = args.role as RoleType;
      const displayName = String(args.name).trim();
      const placeToken = args.place_token !== false;
      const doAnnounce = args.announce !== false;

      const statsPartial =
        args.stats && isRecord(args.stats)
          ? (Object.fromEntries(
              Object.entries(args.stats).filter(
                ([k, v]) => STAT_KEYS_FOR_GM.has(k) && typeof v === 'number' && Number.isFinite(v),
              ),
            ) as Partial<Record<keyof Stats, number>>)
          : {};

      const skillsIn: UniqueGmSkillInput[] = [];
      if (Array.isArray(args.skills)) {
        for (const s of args.skills) {
          if (!isRecord(s)) continue;
          const linked = s.linked_stat;
          skillsIn.push({
            name: String(s.name),
            value: Number(s.value),
            linkedStat:
              typeof linked === 'string' && STAT_KEYS_FOR_GM.has(linked) ? (linked as keyof Stats) : undefined,
            category: typeof s.category === 'string' ? s.category : undefined,
            isChipped: s.is_chipped === true,
            isSpecialAbility: s.is_special_ability === true,
          });
        }
      }

      const itemBlobs: Record<string, unknown>[] = Array.isArray(args.items)
        ? args.items.filter(isRecord)
        : [];

      let combatMods: Character['combatModifiers'] | undefined;
      if (isRecord(args.combat_modifiers)) {
        const cm = args.combat_modifiers;
        const ini = typeof cm.initiative === 'number' && Number.isFinite(cm.initiative) ? cm.initiative : 0;
        const stunRaw = cm.stun_save ?? cm.stunSave;
        const stun =
          typeof stunRaw === 'number' && Number.isFinite(stunRaw) ? stunRaw : 0;
        combatMods = { initiative: ini, stunSave: stun };
      }

      const sa = args.special_ability as Record<string, unknown>;
      const built = buildUniqueGmNpc({
        sessionId: ctx.sessionId,
        name: displayName,
        role,
        stats: statsPartial,
        specialAbility: {
          name: String(sa.name),
          value: Number(sa.value),
        },
        skills: skillsIn,
        items: itemBlobs,
        age:
          typeof args.age === 'number' && Number.isFinite(args.age)
            ? Math.max(1, Math.floor(args.age))
            : 30,
        reputation:
          typeof args.reputation === 'number' && Number.isFinite(args.reputation)
            ? Math.floor(args.reputation)
            : 0,
        improvementPoints:
          typeof args.improvement_points === 'number' && Number.isFinite(args.improvement_points)
            ? Math.floor(args.improvement_points)
            : 0,
        eurobucks:
          typeof args.eurobucks === 'number' && Number.isFinite(args.eurobucks)
            ? Math.max(0, Math.floor(args.eurobucks))
            : 0,
        damage: typeof args.damage === 'number' && Number.isFinite(args.damage) ? Number(args.damage) : 0,
        imageUrl: typeof args.image_url === 'string' ? args.image_url : '',
        combatModifiers: combatMods,
      });

      const persisted = await persistNewNpcWithOptionalToken(ctx, built, placeToken, rng);
      if (!persisted.ok) return { ok: false, name, error: persisted.error };
      const { saved, token_id } = persisted;

      if (doAnnounce) {
        const customLine =
          typeof args.announcement_text === 'string' && args.announcement_text.trim() !== ''
            ? args.announcement_text.trim()
            : formatUniqueNpcAnnouncement(saved);
        const errAnn = await insertChatMessage(ctx.supabase, ctx.sessionId, 'Game Master', customLine, 'system', {
          kind: 'npc_spawn_unique',
          character_id: saved.id,
        });
        if (errAnn) return { ok: false, name, error: errAnn.message };
      }

      return {
        ok: true,
        name: validated.name,
        result: {
          character_id: saved.id,
          name: saved.name,
          role: saved.role,
          token_id,
          item_count: saved.items.length,
          skill_count: saved.skills.length,
        },
      };
    }
    case 'add_chat_as_npc': {
      const npcName = String(args.npc_name);
      const text = String(args.text);
      const err = await insertChatMessage(ctx.supabase, ctx.sessionId, npcName, text, 'narration', {
        kind: 'npc_dialogue',
        npcName,
      });
      if (err) return { ok: false, name, error: err.message };
      return { ok: true, name, result: { npc_name: npcName, posted: true } };
    }
    default:
      return { ok: false, name, error: 'Unhandled tool' };
  }
}

export async function executeGmToolCallFromModel(
  name: string,
  argsJson: string,
  ctx: ToolExecutorContext,
): Promise<ToolExecutionResult> {
  const parsed = parseToolArgumentsJson(argsJson);
  if (!parsed) return { ok: false, name, error: 'Invalid JSON for tool arguments' };
  return executeGmTool(name, parsed, ctx);
}
