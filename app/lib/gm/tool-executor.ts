/**
 * GM tool execution: validation + Supabase mutations (Requirements 3.2, 3.3, 3.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character, ChatMessage, Zone } from '../types';
import { saveCharacterToSupabase } from '../db/character-serialize';
import { parseSceneJson } from '../realtime/db-mapper';
import {
  applyGmAddItem,
  applyGmDamage,
  applyGmDeductMoney,
  applyGmFieldUpdate,
  applyGmRemoveItem,
  normalizeIncomingItem,
} from './character-mutations';
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
  | 'generate_scenery'
  | 'play_narration'
  | 'lookup_rules'
  | 'update_character_field';

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
      const formula = str(raw.formula, 'formula');
      if (typeof formula !== 'string') return { ok: false, error: formula.error };
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
      const item = normalizeIncomingItem(rawItem, itemId);
      if (!item) return { ok: false, name, error: 'Invalid item.type' };
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
      const formula = String(args.formula);
      const reason = optStr(args.reason) ?? '';
      const characterId = optStr(args.character_id);
      const err = await insertChatMessage(ctx.supabase, ctx.sessionId, 'Game Master', `Roll requested: ${formula}${reason ? ` — ${reason}` : ''}`, 'system', {
        kind: 'roll_request',
        formula,
        reason,
        characterId: characterId ?? null,
      });
      if (err) return { ok: false, name, error: err.message };
      return { ok: true, name, result: { formula, reason, character_id: characterId ?? null } };
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
