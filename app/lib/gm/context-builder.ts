/**
 * Assembles LLM messages for the AI-GM (Requirements 3.6, 4.1).
 */

import type { Character, ChatMessage, CombatState, MapCoverRegion, Scene, SessionSettings, Token } from '../types';
import { estimateTokens } from './lorebook';
import { effectiveCharacterTeam } from '../game-logic/teams';
import {
  MAP_GRID_DEFAULT_COLS,
  MAP_GRID_DEFAULT_ROWS,
  normalizeGridDimension,
  pctToCell,
} from '../map/grid';
import { buildTacticalCoverHints } from '../map/tactical-cover-hint';
import { CP2020_COVER_TYPES, coverTypeLabel } from '../map/cover-types';
import { parseSessionSettingsJson } from '../realtime/db-mapper';

export const CORE_GM_RULES = `You are the Game Master for a Cyberpunk 2020 tabletop session (R. Talsorian Games).
You narrate scenes, adjudicate actions fairly, and use tools to update game state when outcomes are clear.
Stay in setting (dark future, corporate dystopia). Do not invent major setting facts that contradict established table state.
When uncertain about a PC's action, ask for a roll via request_roll (prefer structured skill/stat + ids from CHARACTERS_JSON, or raw_formula). You CAN roll dice yourself for NPCs and world events using roll_dice.
Output engaging but concise narration; use tools for concrete state changes (damage, money, items, map, etc.).

**Character sheets and tools:** The user message block includes CHARACTERS_JSON. Every entry has an \`id\` field (UUID) and \`name\`. You always have this data—do not claim you lack access to character sheets.
For character tools (apply_damage, deduct_money, add_money, heal_damage, add_item, remove_item, equip_item, modify_skill, adjust_improvement_points, update_ammo, set_condition, update_character_field), pass \`character_id\` from that JSON. Prefer the character whose \`name\` matches CURRENT_MESSAGE_SPEAKER when it clearly refers to the acting player; if there is only one PC (type "character"), use that id; if several PCs could apply, ask which **character by name**, never ask the human to paste a UUID.
For move_token, add_token, and remove_token, use token ids from MAP_TOKENS_JSON when present; if missing, describe map changes in narration and avoid guessing ids.
**Tactical map:** TACTICAL_GRID_JSON gives cols, rows, snap_to_grid, and meters_per_square. MAP_TOKENS_JSON lists each token's x,y (0–100% of map width/height) plus cell_column and cell_row (0-based) on that grid—use cells for range, flanking, and movement. When snap_to_grid is true, the client snaps positions to cell centers; pass x,y as percentages (cell center ≈ ((col+0.5)/cols)*100 for x, ((row+0.5)/rows)*100 for y).
**Teams:** CHARACTERS_JSON includes \`team\` (effective id). Same team = allies; different team = enemies for tactical purposes. Empty sheet team defaults PCs to \`party\` and NPCs to \`hostile\`. MAP_TOKENS_JSON repeats \`team\` when the token is linked to a sheet.
**Cover & LOS:** MAP_COVER_JSON lists drawn cover zones (grid cell ranges) and CP2020 **SP** values from the Common Cover table (Friday Night Firefight). Use these when narrating hits through cover, penetration, and line of sight. **TACTICAL_COVER_HINT_JSON** (when non-empty) lists tokens with hostile line-of-sight relations and server-suggested x,y cell centers that put drawn cover between that token and as many enemies as possible—prefer those coordinates when you move someone to take cover (still respect fiction, movement limits, and snap_to_grid).
If CHARACTERS_JSON is empty, the session has no sheets synced yet—say that and skip character tools.

**Money:** Use \`add_money\` to reward eurobucks (payment, loot, rewards). Use \`deduct_money\` to subtract (purchases, bribes, fees). Never use update_character_field for eurobucks—use the dedicated tools.

**Damage and healing:** Use \`apply_damage\` for the full damage pipeline (SP, BTM, ablation). For **NPCs** (\`type: "npc"\`), the tool auto-rolls required **stun** and **limb-severance death** saves and returns \`npc_auto_rolls\` in the result—narrate those outcomes. Use \`heal_damage\` when a character receives medical care or rests—it reduces the damage counter. Do not set damage directly via update_character_field.

**Dice — request_roll:** Prefer structured rolls so the client can build the same bonus as the character sheet. Set \`roll_kind\` to one of:
- \`skill\`: pass \`character_id\` (UUID from CHARACTERS_JSON) and \`skill_id\` (UUID from that character's \`skills[]\` in JSON). Do not hand-add stat + skill points; the app computes \`1d10+total\`. Optional \`formula\` is ignored when resolution succeeds.
- \`stat\`: pass \`character_id\` and \`stat\` (lowercase: int, ref, tech, cool, attr, luck, ma, bt, emp) for a raw stat check.
- \`raw_formula\`: pass \`formula\` only (e.g. odd rolls, damage); optional \`character_id\` for context.

If you omit \`roll_kind\`, the tool behaves as legacy \`raw_formula\` and requires \`formula\`.

Use \`roll_dice\` to roll server-side for NPCs, random encounters, hit location, or GM-only rolls; results go to chat.

**Equipment:** Use \`equip_item\` to toggle items equipped/unequipped (triggers armor SP recalculation). Use \`update_ammo\` to set remaining shots or reload a weapon to full magazine.

**Skills:** Use \`modify_skill\` to change a skill value by name (IP spending, training).

**Improvement Points (IP):** CHARACTERS_JSON includes \`improvementPoints\` per sheet. Award IP sparingly: end of a job, after real danger, major goals, memorable roleplay—not every exchange. Typical Referee awards are often ~1–3 IP per session for solid play, more for exceptional arcs (see lore \`improvement-points\`). Use \`adjust_improvement_points\` with a non-zero \`delta\` and short \`reason\` (audited in chat). For absolute totals only when needed, \`update_character_field\` path \`improvementPoints\` is allowed but does not post an audit line—prefer \`adjust_improvement_points\`.

**Conditions:** Use \`set_condition\` to apply or remove status effects. "stunned" toggles only the isStunned flag (not stored in conditions[]). Other conditions are persisted in the character's conditions array (with optional \`duration_rounds\`) and visible to all players. Specify \`duration_rounds\` when the CP2020 rules define one (Dazzle grenade = blinded 12 rounds, Sonic grenade = deafened 12 rounds, Incendiary = on_fire 9 rounds; 1 CP2020 "turn" = 3 rounds). Omit duration for indefinite conditions. CP2020-relevant conditions: unconscious, asleep (also sets isStunned), blinded, on_fire, grappled, prone, deafened, poisoned, drugged, cyberpsychosis. Severance conditions (\`severed_right_arm\`, \`severed_left_arm\`, \`severed_right_leg\`, \`severed_left_leg\`) are auto-applied by \`apply_damage\` on limb hits dealing >8 final damage; leave them in place unless the character receives cyberware replacement or similar narrative healing.

**Initiative / combat rounds:** When a fight starts, call \`start_combat\` to roll initiative for **every** character in the session (full **REF** after cyberware/armor/wounds + exploding 1d10 + manual initiative mod + Solo Combat Sense + **cyber initiative bonus** from equipped ware such as Kerenzikov). That builds turn order, sets round 1, and posts the order to chat. Call \`advance_round\` at the start of each new round: it increments the round counter, ticks \`duration_rounds\` on **all** conditions in the session, removes expired ones, and posts a summary line. Call \`end_combat\` to clear the tracker; set \`clear_timed_conditions\` true if timed conditions should be wiped, and optional \`narration\` for the closing line. The human GM can also advance turns from the session sidebar.

**Combat tracker snapshot:** \`COMBAT_TRACKER_JSON\` (when \`inCombat\` is true) lists initiative order and, for each combatant, \`isStunned\`, \`isStabilized\`, \`woundState\`, \`damage\`, and \`deathSaveTarget\` merged from the live sheet—use it so narration matches the table. If \`startOfTurnSavesPendingFor\` is set, that character's **start-of-turn stun recovery / ongoing death save** is still being resolved in the client; keep your narration compatible with CP2020 until that flag clears (see lore \`start-of-turn-saves\`). When a player asks the GM to override a **stun** outcome, weigh the fiction but default to the rules unless the table clearly agrees to a fiat.

**NPCs:** Use \`spawn_random_npc\` (or equivalent \`spawn_npc\`) for **generic** CP2020 **Fast Character System** mooks: 2D6 stats, 40-pt career, book armor/weapon table; optional \`stat_overrides\` (2–10), \`threat\`, \`announce\`, \`place_token\`, \`team\` (defaults **hostile**—set \`party\` or a shared id for allies). For **named or boss NPCs** where you must set the sheet yourself (custom stats, special ability label, arbitrary skills including homebrew names, cyberware/weapons with specific stats), use \`spawn_unique_npc\` with \`name\`, \`role\`, \`special_ability\`, optional \`stats\`, \`skills[]\`, \`items[]\`, optional \`announcement_text\`, and optional \`team\`. Use \`add_chat_as_npc\` for dialogue-only when no sheet is needed.

**Session memory:** Use \`update_summary\` to persist important story events to the session summary. Do this after major plot beats, completed objectives, or significant revelations. The summary survives across long sessions when old chat messages are trimmed.

**Rules lookups:** When the player asks how a rule works, to "look up", "refresh", "before I roll", "what does the book say", or asks about mechanics (armor, SP, BTM, damage pipeline, initiative, skills, netrunning, economy), call \`lookup_rules\` with a short \`query\` string **before** you answer. Ground your answer in the tool text (it comes from the table's loaded lore JSON). If the snippet is thin, say so and supplement with general CP2020 knowledge—do not rely on memory alone when the player explicitly wants a rules refresh.
`;

export interface CompactCharacterPayload {
  id: string;
  name: string;
  type: Character['type'];
  isNpc: boolean;
  role: Character['role'];
  damage: number;
  isStunned: boolean;
  isStabilized: boolean;
  conditions: Array<{ name: string; duration: number | null }>;
  eurobucks: number;
  improvementPoints: number;
  /** Effective tactical team (sheet value or default party/hostile). */
  team: string;
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
    isNpc: c.isNpc,
    role: c.role,
    damage: c.damage,
    isStunned: c.isStunned,
    isStabilized: c.isStabilized,
    conditions: c.conditions ?? [],
    eurobucks: c.eurobucks,
    improvementPoints: c.improvementPoints,
    team: effectiveCharacterTeam(c),
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

export interface MapTokenForLlm {
  id: string;
  name: string;
  controlled_by: Token['controlledBy'];
  x: number;
  y: number;
  character_id: string | null;
  /** 0-based column on the tactical grid (see TACTICAL_GRID_JSON.cols). */
  cell_column: number;
  /** 0-based row on the tactical grid (see TACTICAL_GRID_JSON.rows). */
  cell_row: number;
  /** Effective team when linked to a sheet; null if token has no character_id. */
  team: string | null;
}

export interface TacticalGridForLlm {
  cols: number;
  rows: number;
  snap_to_grid: boolean;
  meters_per_square: number;
}

export function tacticalGridPayloadFromSettings(settings: SessionSettings): TacticalGridForLlm {
  return {
    cols: normalizeGridDimension(settings.mapGridCols, MAP_GRID_DEFAULT_COLS),
    rows: normalizeGridDimension(settings.mapGridRows, MAP_GRID_DEFAULT_ROWS),
    snap_to_grid: settings.mapSnapToGrid,
    meters_per_square: settings.mapMetersPerSquare,
  };
}

export interface MapCoverRegionForLlm {
  id: string;
  cell_c0: number;
  cell_r0: number;
  cell_c1: number;
  cell_r1: number;
  label: string;
  sp: number;
}

export function serializeMapCoverForLlm(regions: MapCoverRegion[]): MapCoverRegionForLlm[] {
  return regions.map((r) => {
    const def = CP2020_COVER_TYPES.find((t) => t.id === r.coverTypeId);
    return {
      id: r.id,
      cell_c0: r.c0,
      cell_r0: r.r0,
      cell_c1: r.c1,
      cell_r1: r.r1,
      label: def?.label ?? coverTypeLabel(r.coverTypeId),
      sp: def?.sp ?? 0,
    };
  });
}

export function serializeTokensForLlm(
  tokens: Token[],
  settings: SessionSettings,
  characters?: Character[],
): MapTokenForLlm[] {
  const cols = normalizeGridDimension(settings.mapGridCols, MAP_GRID_DEFAULT_COLS);
  const rows = normalizeGridDimension(settings.mapGridRows, MAP_GRID_DEFAULT_ROWS);
  const byId = characters ? new Map(characters.map((c) => [c.id, c])) : null;
  return tokens.map((t) => {
    const { c, r } = pctToCell(t.x, t.y, cols, rows);
    const linked = t.characterId && byId?.get(t.characterId);
    return {
      id: t.id,
      name: t.name,
      controlled_by: t.controlledBy,
      x: t.x,
      y: t.y,
      character_id: t.characterId ?? null,
      cell_column: c,
      cell_row: r,
      team: linked ? effectiveCharacterTeam(linked) : null,
    };
  });
}

/** Per-row initiative + wound state for the AI-GM (merged from tracker + sheets). */
export interface CombatTrackerCombatantForLlm {
  characterId: string;
  name: string;
  initiativeTotal: number;
  turnOrderIndex: number;
  isActiveTurn: boolean;
  /** Null if no sheet synced for this id. */
  isStunned: boolean | null;
  isStabilized: boolean | null;
  woundState: string | null;
  damage: number | null;
  deathSaveTarget: number | null;
  type: Character['type'] | null;
}

export interface CombatTrackerContextPayload {
  inCombat: boolean;
  round: number | null;
  activeTurnIndex: number | null;
  activeCombatantCharacterId: string | null;
  startOfTurnSavesPendingFor: string | null;
  combatants: CombatTrackerCombatantForLlm[];
}

export function buildCombatTrackerContextPayload(
  combatState: CombatState | null | undefined,
  characters: Character[],
): CombatTrackerContextPayload {
  if (!combatState || combatState.entries.length === 0) {
    return {
      inCombat: false,
      round: null,
      activeTurnIndex: null,
      activeCombatantCharacterId: null,
      startOfTurnSavesPendingFor: null,
      combatants: [],
    };
  }

  const byId = new Map(characters.map((c) => [c.id, c]));
  const activeIdx = combatState.activeTurnIndex;
  const activeEntry = combatState.entries[activeIdx];
  const combatants: CombatTrackerCombatantForLlm[] = combatState.entries.map((e, turnOrderIndex) => {
    const c = byId.get(e.characterId) ?? null;
    return {
      characterId: e.characterId,
      name: e.name,
      initiativeTotal: e.total,
      turnOrderIndex,
      isActiveTurn: turnOrderIndex === activeIdx,
      isStunned: c?.isStunned ?? null,
      isStabilized: c?.isStabilized ?? null,
      woundState: c?.derivedStats?.woundState ?? null,
      damage: c?.damage ?? null,
      deathSaveTarget:
        c?.derivedStats?.deathSaveTarget !== undefined ? c.derivedStats.deathSaveTarget : null,
      type: c?.type ?? null,
    };
  });

  return {
    inCombat: true,
    round: combatState.round,
    activeTurnIndex: combatState.activeTurnIndex,
    activeCombatantCharacterId: activeEntry?.characterId ?? null,
    startOfTurnSavesPendingFor: combatState.startOfTurnSavesPendingFor ?? null,
    combatants,
  };
}

export interface BuildContextInput {
  sessionName: string;
  sessionSummary: string;
  activeScene: Scene;
  characters: Character[];
  /** Initiative tracker + per-combatant wound snapshot; omit or null when not in combat. */
  combatState?: CombatState | null;
  /** Map tokens for move_token / add_token / remove_token tool calls. */
  mapTokens: Token[];
  /** Session grid + measurement defaults; drives TACTICAL_GRID_JSON and per-token cell indices. */
  sessionSettings?: SessionSettings;
  /** Tactical cover rectangles (from sessions.map_state); omit for empty. */
  mapCoverRegions?: MapCoverRegion[];
  chatHistory: ChatMessage[];
  /** Latest user line (also usually last in chatHistory). */
  playerMessage: string;
  /** Display name for who sent this message (matches chat speaker). */
  messageSpeaker: string;
  /** Injected rules text from lorebook. */
  loreInjection: string;
  /** Max messages from history (oldest dropped first). */
  maxHistoryMessages?: number;
  /** From chat row / POST body; drives special GM instructions (e.g. stun override). */
  playerMessageMetadata?: Record<string, unknown> | null;
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

function stunOverrideInstruction(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || meta.kind !== 'stun_override_request') return null;
  const id = meta.characterId;
  if (typeof id !== 'string' || !id) return null;
  return `REQUEST_FOCUS: stun_override_request for character_id \`${id}\`.
You must resolve whether **isStunned** should change using tools: prefer \`set_condition\` with \`condition\` "stunned" and \`active\` true/false (toggles isStunned). Narrate briefly; lean on CP2020 unless the PLAYER_MESSAGE clearly asks for table fiat.`;
}

export function buildGmUserContent(input: BuildContextInput): string {
  const history = sliceRecentChat(input.chatHistory, input.maxHistoryMessages ?? 40);
  const historyBlock = history.map(formatChatLine).join('\n');

  const settings = input.sessionSettings ?? parseSessionSettingsJson(null);
  const charsJson = JSON.stringify(input.characters.map(serializeCharacterForLlm));
  const sceneJson = JSON.stringify(sceneToPayload(input.activeScene));
  const mapTokensJson = JSON.stringify(serializeTokensForLlm(input.mapTokens, settings, input.characters));
  const tacticalGridJson = JSON.stringify(tacticalGridPayloadFromSettings(settings));
  const mapCoverJson = JSON.stringify(serializeMapCoverForLlm(input.mapCoverRegions ?? []));
  const coverHints = buildTacticalCoverHints({
    characters: input.characters,
    tokens: input.mapTokens,
    mapCoverRegions: input.mapCoverRegions ?? [],
    sessionSettings: settings,
  });
  const tacticalCoverHintJson = JSON.stringify(coverHints);
  const combatTrackerJson = JSON.stringify(
    buildCombatTrackerContextPayload(input.combatState ?? null, input.characters),
  );

  const overrideInstr = stunOverrideInstruction(input.playerMessageMetadata ?? null);

  const parts = [
    `SESSION: ${input.sessionName}`,
    `SUMMARY: ${input.sessionSummary || '(none)'}`,
    `CURRENT_MESSAGE_SPEAKER: ${input.messageSpeaker || 'Player'}`,
    `ACTIVE_SCENE_JSON: ${sceneJson}`,
    `TACTICAL_GRID_JSON: ${tacticalGridJson}`,
    `MAP_COVER_JSON: ${mapCoverJson}`,
    `TACTICAL_COVER_HINT_JSON: ${tacticalCoverHintJson}`,
    `MAP_TOKENS_JSON: ${mapTokensJson}`,
    `COMBAT_TRACKER_JSON: ${combatTrackerJson}`,
    `CHARACTERS_JSON: ${charsJson}`,
    `RECENT_CHAT:\n${historyBlock || '(empty)'}`,
    `LORE_RULES:\n${input.loreInjection || '(none)'}`,
    ...(overrideInstr ? [`GM_TASK:\n${overrideInstr}`] : []),
    `PLAYER_MESSAGE:\n${input.playerMessage}`,
  ];

  return parts.join('\n\n');
}

export function estimateContextTokens(userContent: string, systemPrompt: string): number {
  return estimateTokens(systemPrompt) + estimateTokens(userContent);
}
