/**
 * Assembles LLM messages for the AI-GM (Requirements 3.6, 4.1).
 */

import type { Character, ChatMessage, Scene } from '../types';
import { estimateTokens } from './lorebook';

export const CORE_GM_RULES = `You are the Game Master for a Cyberpunk 2020 tabletop session (R. Talsorian Games).
You narrate scenes, adjudicate actions fairly, and use tools to update game state when outcomes are clear.
Stay in setting (dark future, corporate dystopia). Do not invent major setting facts that contradict established table state.
When uncertain, ask for a roll or use request_roll with a clear formula. Respect player agency: never roll dice yourself for PCs unless the table agrees.
Output engaging but concise narration; use tools for concrete state changes (damage, money, items, map, etc.).

**Character sheets and tools:** The user message block includes CHARACTERS_JSON. Every entry has an \`id\` field (UUID) and \`name\`. You always have this data—do not claim you lack access to character sheets.
For deduct_money, apply_damage, add_item, remove_item, update_character_field, and similar tools, pass \`character_id\` from that JSON. Prefer the character whose \`name\` matches CURRENT_MESSAGE_SPEAKER when it clearly refers to the acting player; if there is only one PC (type "character"), use that id; if several PCs could apply, ask which **character by name**, never ask the human to paste a UUID.
For move_token, use token ids from the session map state when provided in context; if missing, describe movement and avoid guessing ids.
If CHARACTERS_JSON is empty, the session has no sheets synced yet—say that and skip character tools.

**Rules lookups:** When the player asks how a rule works, to "look up", "refresh", "before I roll", "what does the book say", or asks about mechanics (armor, SP, BTM, damage pipeline, initiative, skills, netrunning, economy), call \`lookup_rules\` with a short \`query\` string **before** you answer. Ground your answer in the tool text (it comes from the table's loaded lore JSON). If the snippet is thin, say so and supplement with general CP2020 knowledge—do not rely on memory alone when the player explicitly wants a rules refresh.
`;

export interface CompactCharacterPayload {
  id: string;
  name: string;
  type: Character['type'];
  role: Character['role'];
  damage: number;
  isStunned: boolean;
  eurobucks: number;
  woundState: string | undefined;
  stats: Record<string, { total: number }>;
  skills: Array<{ name: string; value: number }>;
  items: Array<{ id: string; name: string; type: string; equipped?: boolean }>;
  hitLocations: Record<string, { stoppingPower: number; ablation: number }>;
}

/** Strip heavy / redundant fields; keep what the GM needs for play. */
export function serializeCharacterForLlm(c: Character): CompactCharacterPayload {
  const skills = (c.skills ?? []).slice(0, 40).map((s) => ({
    name: s.name,
    value: s.value,
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
