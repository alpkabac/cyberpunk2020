/**
 * Assembles LLM messages for the AI-GM (Requirements 3.6, 4.1).
 */

import type { Character, ChatMessage, Scene } from '../types';
import { estimateTokens } from './lorebook';

export const CORE_GM_RULES = `You are the Game Master for a Cyberpunk 2020 tabletop session (R. Talsorian Games).
You narrate scenes, adjudicate actions fairly, and use tools to update game state when outcomes are clear.
Stay in setting (dark future, corporate dystopia). Do not invent major setting facts that contradict established table state.
When uncertain about a PC's action, ask for a roll via request_roll (prefer structured skill/stat + ids from CHARACTERS_JSON, or raw_formula). You CAN roll dice yourself for NPCs and world events using roll_dice.
Output engaging but concise narration; use tools for concrete state changes (damage, money, items, map, etc.).

**Character sheets and tools:** The user message block includes CHARACTERS_JSON. Every entry has an \`id\` field (UUID) and \`name\`. You always have this data—do not claim you lack access to character sheets.
For character tools (apply_damage, deduct_money, add_money, heal_damage, add_item, remove_item, equip_item, modify_skill, update_ammo, set_condition, update_character_field), pass \`character_id\` from that JSON. Prefer the character whose \`name\` matches CURRENT_MESSAGE_SPEAKER when it clearly refers to the acting player; if there is only one PC (type "character"), use that id; if several PCs could apply, ask which **character by name**, never ask the human to paste a UUID.
For move_token, use token ids from the session map state when provided in context; if missing, describe movement and avoid guessing ids.
If CHARACTERS_JSON is empty, the session has no sheets synced yet—say that and skip character tools.

**Money:** Use \`add_money\` to reward eurobucks (payment, loot, rewards). Use \`deduct_money\` to subtract (purchases, bribes, fees). Never use update_character_field for eurobucks—use the dedicated tools.

**Damage and healing:** Use \`apply_damage\` for the full damage pipeline (SP, BTM, ablation). Use \`heal_damage\` when a character receives medical care or rests—it reduces the damage counter. Do not set damage directly via update_character_field.

**Dice — request_roll:** Prefer structured rolls so the client can build the same bonus as the character sheet. Set \`roll_kind\` to one of:
- \`skill\`: pass \`character_id\` (UUID from CHARACTERS_JSON) and \`skill_id\` (UUID from that character's \`skills[]\` in JSON). Do not hand-add stat + skill points; the app computes \`1d10+total\`. Optional \`formula\` is ignored when resolution succeeds.
- \`stat\`: pass \`character_id\` and \`stat\` (lowercase: int, ref, tech, cool, attr, luck, ma, bt, emp) for a raw stat check.
- \`raw_formula\`: pass \`formula\` only (e.g. odd rolls, damage); optional \`character_id\` for context.

If you omit \`roll_kind\`, the tool behaves as legacy \`raw_formula\` and requires \`formula\`.

Use \`roll_dice\` to roll server-side for NPCs, random encounters, hit location, or GM-only rolls; results go to chat.

**Equipment:** Use \`equip_item\` to toggle items equipped/unequipped (triggers armor SP recalculation). Use \`update_ammo\` to set remaining shots or reload a weapon to full magazine.

**Skills:** Use \`modify_skill\` to change a skill value by name (IP spending, training).

**Conditions:** Use \`set_condition\` to apply or remove status effects. "stunned" toggles only the isStunned flag (not stored in conditions[]). Other conditions are persisted in the character's conditions array (with optional \`duration_rounds\`) and visible to all players. Specify \`duration_rounds\` when the CP2020 rules define one (Dazzle grenade = blinded 12 rounds, Sonic grenade = deafened 12 rounds, Incendiary = on_fire 9 rounds; 1 CP2020 "turn" = 3 rounds). Omit duration for indefinite conditions. CP2020-relevant conditions: unconscious, asleep (also sets isStunned), blinded, on_fire, grappled, prone, deafened, poisoned, drugged, cyberpsychosis.

**NPC dialogue:** Use \`add_chat_as_npc\` to post in-character dialogue from a named NPC—distinct from your narration voice. Use this for important NPC speech that players should see attributed to that NPC.

**Session memory:** Use \`update_summary\` to persist important story events to the session summary. Do this after major plot beats, completed objectives, or significant revelations. The summary survives across long sessions when old chat messages are trimmed.

**Rules lookups:** When the player asks how a rule works, to "look up", "refresh", "before I roll", "what does the book say", or asks about mechanics (armor, SP, BTM, damage pipeline, initiative, skills, netrunning, economy), call \`lookup_rules\` with a short \`query\` string **before** you answer. Ground your answer in the tool text (it comes from the table's loaded lore JSON). If the snippet is thin, say so and supplement with general CP2020 knowledge—do not rely on memory alone when the player explicitly wants a rules refresh.
`;

export interface CompactCharacterPayload {
  id: string;
  name: string;
  type: Character['type'];
  role: Character['role'];
  damage: number;
  isStunned: boolean;
  conditions: Array<{ name: string; duration: number | null }>;
  eurobucks: number;
  woundState: string | undefined;
  stats: Record<string, { total: number }>;
  /** Include id + linkedStat so request_roll can use skill_id + character_id. */
  skills: Array<{ id: string; name: string; value: number; linkedStat: string }>;
  items: Array<{ id: string; name: string; type: string; equipped?: boolean }>;
  hitLocations: Record<string, { stoppingPower: number; ablation: number }>;
}

/** Strip heavy / redundant fields; keep what the GM needs for play. */
export function serializeCharacterForLlm(c: Character): CompactCharacterPayload {
  const skills = (c.skills ?? []).slice(0, 40).map((s) => ({
    id: s.id,
    name: s.name,
    value: s.value,
    linkedStat: String(s.linkedStat),
  }));
  const items = (c.items ?? []).slice(0, 60).map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type,
    equipped: i.equipped,
  }));

  const stats: Record<string, { total: number }> = {};
  for (const key of Object.keys(c.stats) as Array<keyof Character['stats']>) {
    stats[key] = { total: c.stats[key].total };
  }

  const hitLocations: CompactCharacterPayload['hitLocations'] = {};
  for (const z of Object.keys(c.hitLocations ?? {}) as Array<keyof Character['hitLocations']>) {
    const h = c.hitLocations[z];
    hitLocations[z] = { stoppingPower: h.stoppingPower, ablation: h.ablation };
  }

  return {
    id: c.id,
    name: c.name,
    type: c.type,
    role: c.role,
    damage: c.damage,
    isStunned: c.isStunned,
    conditions: c.conditions ?? [],
    eurobucks: c.eurobucks,
    woundState: c.derivedStats?.woundState,
    stats,
    skills,
    items,
    hitLocations,
  };
}

export interface SceneContextPayload {
  location: string;
  description: string;
  situation: string;
  npcsPresent: string[];
}

export function sceneToPayload(scene: Scene): SceneContextPayload {
  return {
    location: scene.location,
    description: scene.description,
    situation: scene.situation,
    npcsPresent: scene.npcsPresent ?? [],
  };
}

export interface BuildContextInput {
  sessionName: string;
  sessionSummary: string;
  activeScene: Scene;
  characters: Character[];
  chatHistory: ChatMessage[];
  /** Latest user line (also usually last in chatHistory). */
  playerMessage: string;
  /** Display name for who sent this message (matches chat speaker). */
  messageSpeaker: string;
  /** Injected rules text from lorebook. */
  loreInjection: string;
  /** Max messages from history (oldest dropped first). */
  maxHistoryMessages?: number;
}

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/**
 * Builds ordered chat history for the model (Requirements 3.6).
 */
export function sliceRecentChat(history: ChatMessage[], max: number): ChatMessage[] {
  if (history.length <= max) return history;
  return history.slice(history.length - max);
}

export function formatChatLine(m: ChatMessage): string {
  return `[${m.type}] ${m.speaker}: ${m.text}`;
}

export function buildGmUserContent(input: BuildContextInput): string {
  const history = sliceRecentChat(input.chatHistory, input.maxHistoryMessages ?? 40);
  const historyBlock = history.map(formatChatLine).join('\n');

  const charsJson = JSON.stringify(input.characters.map(serializeCharacterForLlm));
  const sceneJson = JSON.stringify(sceneToPayload(input.activeScene));

  const parts = [
    `SESSION: ${input.sessionName}`,
    `SUMMARY: ${input.sessionSummary || '(none)'}`,
    `CURRENT_MESSAGE_SPEAKER: ${input.messageSpeaker || 'Player'}`,
    `ACTIVE_SCENE_JSON: ${sceneJson}`,
    `CHARACTERS_JSON: ${charsJson}`,
    `RECENT_CHAT:\n${historyBlock || '(empty)'}`,
    `LORE_RULES:\n${input.loreInjection || '(none)'}`,
    `PLAYER_MESSAGE:\n${input.playerMessage}`,
  ];

  return parts.join('\n\n');
}

export function estimateContextTokens(userContent: string, systemPrompt: string): number {
  return estimateTokens(systemPrompt) + estimateTokens(userContent);
}
