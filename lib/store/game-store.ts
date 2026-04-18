/**
 * Zustand store for client-side game state management
 * Manages characters, session, map, chat, and UI state
 */

import { create } from 'zustand';
import {
  Character,
  Session,
  Token,
  MapCoverRegion,
  MapSuppressiveZone,
  PendingSuppressivePlacement,
  ChatMessage,
  Scene,
  SessionSettings,
  CharacterItem,
  Skill,
  DerivedStats,
  Zone,
  Weapon,
  FireMode,
  DiceRollIntent,
  PendingRollForVoice,
  PendingVoiceGmPayload,
  CombatState,
  PendingGmAttackRequest,
  SessionNarrationImage,
  SessionSoundtrackState,
} from '../types';
import { BROADCAST_EVENTS } from '../realtime/realtime-events';
import {
  calculateDerivedStats,
  applyStatModifiers,
  syncArmorToHitLocations,
  calculateDamage,
  isFlatSaveSuccess,
} from '../game-logic/formulas';
import { maxDamageFromDiceFormula } from '../game-logic/dice';
import { getAmmoConsumed } from '../game-logic/fire-modes';
import { isSeveredConditionName, severedConditionName } from '../game-logic/conditions';
import type { LoadedSessionSnapshot } from '../realtime/session-load';
import {
  characterRowToCharacter,
  mergeCharacterRowWithRealtime,
  postgresRowUpdatedAtMs,
} from '../realtime/db-mapper';
import { parseCombatStateJson } from '../session/combat-state';
import { coverTypeSp } from '../map/cover-types';
import type { SessionMapState } from '../map/map-state';
import { reconcileSuppressiveZonesForCombat } from '../map/suppressive-fire';
import { cellInsideSuppressiveZone } from '../map/suppressive-zone-cells';
import { resolveSuppressiveZoneEntry } from '../game-logic/resolve-suppressive-entry';
import { sortChatMessagesByTimestamp } from '../chat/chat-order';

const LS_AUDIO_MUSIC_VOL = 'cp2020-session-music-volume';
const LS_AUDIO_NARRATION_VOL = 'cp2020-session-narration-volume';

function clampUnitVolume(v: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function deathSaveBonusFromMods(m: Character['combatModifiers'] | undefined): number {
  return (m?.stunSave ?? 0) + (m?.deathSave ?? 0);
}

// ============================================================================
// State Interface
// ============================================================================

interface GameState {
  session: {
    id: string | null;
    name: string;
    createdBy: string | null;
    createdAt: number | null;
    activeScene: Scene | null;
    settings: SessionSettings;
    sessionSummary: string;
    combatState: CombatState | null;
    /** Shared room music (sessions.soundtrack_state). */
    soundtrackState: SessionSoundtrackState | null;
    /** GM scene image (sessions.narration_image). */
    narrationImage: SessionNarrationImage | null;
    /** Signed-in user in session room — used to prompt saves when GM updates this PC via Realtime. */
    viewerUserId: string | null;
  };

  characters: {
    byId: Record<string, Character>;
    allIds: string[];
  };

  npcs: {
    byId: Record<string, Character>;
    allIds: string[];
  };

  map: {
    backgroundImageUrl: string;
    tokens: Token[];
    coverRegions: MapCoverRegion[];
    suppressiveZones: MapSuppressiveZone[];
    /** FIFO suppressive placements waiting for a map rectangle (synced in `sessions.map_state`). */
    pendingSuppressivePlacements: PendingSuppressivePlacement[];
  };

  chat: {
    messages: ChatMessage[];
    isLoading: boolean;
  };

  /**
   * Ephemeral: send Supabase Realtime `broadcast` on the session channel (null when not subscribed).
   */
  sessionBroadcastSend:
    | ((event: string, payload: Record<string, unknown>) => Promise<void>)
    | null;

  /**
   * When set by session sync: persist an NPC sheet to Postgres after local `applyDamage`
   * (including auto NPC stun/death resolution). PCs rely on `useCharacterCloudSync` for the open sheet.
   */
  sessionCharacterPersist: ((characterId: string) => void) | null;

  ui: {
    selectedCharacterId: string | null;
    selectedTokenId: string | null;
    isDiceRollerOpen: boolean;
    diceFormula: string | null;
    /** When true, skill rolls from the Skills tab add special ability to 1d10+total */
    includeSpecialAbilityInSkillRolls: boolean;
    /**
     * Stun/death: next flat d10 applies save. Attack: weapon context for natural-1 fumble resolution.
     * Cleared after resolve (flat saves) or when the roller closes.
     */
    diceRollIntent: DiceRollIntent | null;
    /**
     * Set when an incoming hit forces an immediate Mortal-0 death save
     * (limb severance). After the player resolves the damage stun save, we set
     * `scheduleForcedDeathSaveOnDiceClose` and open the forced death save when
     * they **close** the dice roller (so isStunned is settled first).
     */
    pendingForcedDeathSaveFor: string | null;
    /**
     * After damage stun save when `pendingForcedDeathSaveFor` was set: open forced
     * death save once the dice roller closes (not immediately after the stun roll).
     */
    scheduleForcedDeathSaveOnDiceClose: string | null;
    isChatInputFocused: boolean;
    isVoiceRecording: boolean;
    /** Session voice: STT done, not sent to GM yet. */
    pendingVoiceGm: PendingVoiceGmPayload | null;
    /** `pushToTalk` — stop+STT sends to GM immediately. `session` — review then "Send voice to GM". */
    voiceInputMode: 'pushToTalk' | 'session';
    /** Multiplayer: someone broadcast “session” mode — everyone matches for group recording UX. */
    sessionRecordingGroupActive: boolean;
    sessionRecordingStartedBy: string | null;
    /** True after `/api/gm` returned while GM reply is still generating (narration not in chat yet). */
    gmNarrationPending: boolean;
    /**
     * After start-of-turn stun recovery, pause before opening the chained ongoing death save
     * so the player acknowledges the stun outcome.
     */
    startOfTurnDeathSaveAck: { characterId: string } | null;
    /** Rolls saved for merge with session voice ("Save for voice"); ordered by `rolledAtMs` when sending. */
    pendingRollsForVoice: PendingRollForVoice[];
    /** Incremented on `SESSION_VOICE_STOP_ALL` broadcast so chat can stop remote session takes. */
    sessionVoiceStopAllTick: number;
    /** `turnId` from the latest stop-all broadcast (each client STTs and POSTs a fragment for this id). */
    sessionVoiceStopTurnId: string | null;
    /** Incremented on `SESSION_VOICE_PEER_START` so peers can mirror Session recording. */
    sessionVoicePeerStartTick: number;
    /**
     * When set, rolling this weapon from the Combat tab uses sheet checklist bonuses but
     * the GM’s DV/targets from the latest attack `request_roll` in chat.
     */
    pendingGmAttackRequest: PendingGmAttackRequest | null;
    /** After a successful attack reply to the GM, suppress re-opening pending for the same chat line. */
    lastAnsweredGmAttackRequestMessageId: string | null;
    /** Head of `map.pendingSuppressivePlacements` (who draws next on the tactical map). */
    pendingSuppressivePlacement: PendingSuppressivePlacement | null;
    /** Local-only (persisted in localStorage). Soundtrack bus volume. */
    audioMusicVolume: number;
    /** Local-only (persisted). Cartesia narration playback volume. */
    audioNarrationVolume: number;
    /**
     * Latest room narration TTS cue from realtime broadcast (`SESSION_NARRATION_TTS`).
     * `seq` bumps so clients can schedule playback even for repeated lines.
     */
    narrationTtsCue: { seq: number; messageId: string; playAtMs: number } | null;
  };

  /** Optimistic edit backups for Supabase writes (rollback on RLS/error). */
  realtime: {
    optimisticBackupByCharacterId: Record<string, Character>;
    /** Per character: max Postgres `updated_at` applied via Realtime merge (LWW for out-of-order rows). */
    maxMergedCharacterRowUpdatedAtMs: Record<string, number>;
  };
}

// ============================================================================
// Actions Interface
// ============================================================================

interface GameActions {
  // Session actions
  setSession: (session: Partial<Session>) => void;
  updateSessionSettings: (settings: Partial<SessionSettings>) => void;
  /** Align chat voice UI with `session.settings` (hydration + Realtime `sessions` row). */
  syncVoiceUiFromSessionSettings: (settings: SessionSettings) => void;
  setActiveScene: (scene: Scene) => void;
  setSessionViewerUserId: (userId: string | null) => void;

  // Character actions
  addCharacter: (character: Character) => void;
  updateCharacter: (characterId: string, updates: Partial<Character>) => void;
  removeCharacter: (characterId: string) => void;

  /**
   * Full damage pipeline: applies SP subtraction, head multiplier, BTM, ablation
   * @param isAP - armor piercing ammo halves SP
   */
  applyDamage: (
    characterId: string,
    rawDamage: number,
    location: Zone | null,
    isAP?: boolean,
    pointBlank?: boolean,
    weaponDamageFormula?: string | null,
    /** Map cover along fire line (stacked SP + region ids); penetrating hits ablate each region by 1. */
    cover?: { stackedSp: number; regionIds: string[] } | null,
  ) => void;

  deductMoney: (characterId: string, amount: number) => void;
  addItem: (characterId: string, item: CharacterItem) => void;
  removeItem: (characterId: string, itemId: string) => void;
  /** Sell item for a fraction of list price (default 50%). Adds eurobucks and removes item. */
  sellItem: (characterId: string, itemId: string, sellFraction?: number) => void;
  updateCharacterField: (characterId: string, path: string, value: unknown) => void;

  // Skill actions
  addSkill: (characterId: string, skill: Skill) => void;
  updateSkill: (characterId: string, skillId: string, updates: Partial<Skill>) => void;
  removeSkill: (characterId: string, skillId: string) => void;

  // Weapon actions
  fireWeapon: (
    characterId: string,
    weaponId: string,
    mode: FireMode,
    opts?: { suppressiveRounds?: number },
  ) => boolean;
  reloadWeapon: (characterId: string, weaponId: string) => void;

  // NPC actions
  addNPC: (npc: Character) => void;
  updateNPC: (npcId: string, updates: Partial<Character>) => void;
  removeNPC: (npcId: string) => void;

  // Map actions
  setMapBackground: (url: string) => void;
  setMapCoverRegions: (coverRegions: MapCoverRegion[]) => void;
  /** Replace tactical map regions from DB / persist (cover + suppressive). */
  applySessionMapState: (state: SessionMapState) => void;
  setPendingSuppressivePlacement: (p: PendingSuppressivePlacement | null) => void;
  /** Append a committed suppressive fire to the FIFO queue and persist (any session participant may update). */
  saveSessionMapPendingSuppressive: (p: PendingSuppressivePlacement) => void;
  /** After token lands on grid: suppressive saves for zones at that cell (excludes owner). */
  evaluateSuppressiveFireForTokenCell: (tokenId: string, cellC: number, cellR: number) => void;
  addToken: (token: Token) => void;
  moveToken: (tokenId: string, x: number, y: number) => void;
  removeToken: (tokenId: string) => void;

  // Chat actions
  addChatMessage: (message: ChatMessage) => void;
  setChatLoading: (isLoading: boolean) => void;
  clearChatHistory: () => void;

  // UI actions
  selectCharacter: (characterId: string | null) => void;
  selectToken: (tokenId: string | null) => void;
  openDiceRoller: (formula: string, intent?: DiceRollIntent | null) => void;
  closeDiceRoller: () => void;
  setIncludeSpecialAbilityInSkillRolls: (include: boolean) => void;
  /** Open flat d10 with intent so the roller applies stun save vs target and sets isStunned. */
  beginStunSaveRoll: (characterId: string) => void;
  /** Start of turn while stunned: success clears STUNNED. */
  beginStunRecoveryRoll: (characterId: string) => void;
  /** Open dice UI: request AI-GM ruling on stun (no roll; POST /api/gm). */
  beginStunOverrideRequest: (characterId: string) => void;
  /**
   * Open flat d10 with intent (only if mortally wounded); fail kills the character.
   * When `isStabilized`, does nothing unless `ignoreStabilization` (limb-severance chain).
   */
  beginDeathSaveRoll: (
    characterId: string,
    options?: { ignoreStabilization?: boolean },
  ) => void;
  clearDiceRollIntent: () => void;
  /** Apply stun save from a flat d10 total (for AI / automation). Uses derived stun target + combatModifiers.stunSave. */
  applyStunSaveRollResult: (characterId: string, flatRollTotal: number) => void;
  /** Start-of-turn stun recovery; may chain death save or clear combat pending flag. */
  applyStunRecoveryRollResult: (characterId: string, flatRollTotal: number) => void;
  /**
   * Apply death save from a flat d10 total (for AI / automation).
   * Fail → damage 41 (Dead on wound track). Per FNFF: failed death save while Mortally wounded means death;
   * we represent that as the Dead state (damage ≥ 41), not a separate flag.
   */
  applyDeathSaveRollResult: (characterId: string, flatRollTotal: number) => void;

  /**
   * Medic stabilization (FNFF): total ≥ patient damage. On success, sets
   * `isStabilized` on the patient. Logs outcome to chat.
   */
  applyStabilizationRollResult: (
    patientCharacterId: string,
    success: boolean,
    detail: { rollTotal: number; targetDamage: number },
  ) => void;

  /**
   * NPC stun save: roll flat 1d10 internally, apply `isStunned`, log to chat.
   * Used by applyDamage for NPCs (they can't click the dice modal).
   */
  autoResolveNpcStunSave: (
    characterId: string,
  ) => { roll: number; target: number; success: boolean } | null;

  /**
   * NPC death save: roll flat 1d10 internally, apply death (damage → 41) on
   * failure, log to chat. Skips if the character isn't mortally wounded.
   */
  autoResolveNpcDeathSave: (
    characterId: string,
  ) => { roll: number; target: number; success: boolean } | null;

  /** Open stun recovery or ongoing death save for `startOfTurnSavesPendingFor` flow. */
  openStartOfTurnSavesIfNeeded: (characterId: string) => void;
  /** POST clear_turn_saves_pending (participant); updates local combat state from response. */
  clearStartOfTurnSavesPendingRemote: () => Promise<void>;
  /** Continue start-of-turn chain: open ongoing death save after stun-recovery ack. */
  proceedStartOfTurnDeathSaveAfterAck: () => void;
  /** Close stun→death ack without opening the roller (e.g. pause); pending combat flag remains. */
  dismissStartOfTurnDeathSaveAck: () => void;

  setVoiceRecording: (isRecording: boolean) => void;
  setPendingVoiceGm: (payload: PendingVoiceGmPayload | null) => void;
  clearPendingVoiceGm: () => void;
  setVoiceInputMode: (mode: GameState['ui']['voiceInputMode']) => void;
  setGmNarrationPending: (pending: boolean) => void;
  addPendingRollForVoice: (entry: PendingRollForVoice) => void;
  removePendingRollForVoice: (id: string) => void;
  clearPendingRollsForVoice: () => void;
  clearPendingRollsForSession: (sessionId: string) => void;
  setPendingGmAttackRequest: (payload: PendingGmAttackRequest | null) => void;
  /** Call after posting an attack roll reply for a `roll_request` so pending does not immediately resync. */
  ackGmAttackRollReply: (chatMessageId: string) => void;
  registerSessionBroadcastSend: (
    fn: GameState['sessionBroadcastSend'],
  ) => void;
  registerSessionCharacterPersist: (fn: GameState['sessionCharacterPersist']) => void;
  broadcastSessionRecordingState: (payload: { active: boolean; actorName: string }) => Promise<void>;
  applySessionRecordingBroadcast: (payload: unknown) => void;
  broadcastSessionVoiceStopAll: (turnId: string) => Promise<void>;
  bumpSessionVoiceStopAllFromBroadcast: (payload: unknown) => void;
  broadcastSessionVoicePeerStart: () => Promise<void>;
  bumpSessionVoicePeerStartFromBroadcast: () => void;
  hydrateLocalAudioVolumes: () => void;
  setAudioMusicVolume: (volume: number) => void;
  setAudioNarrationVolume: (volume: number) => void;
  broadcastSessionNarrationTtsPlay: (payload: {
    messageId: string;
    playAtMs: number;
  }) => Promise<void>;
  applySessionNarrationTtsFromBroadcast: (payload: unknown) => void;

  // Supabase Realtime / session sync
  hydrateFromLoadedSnapshot: (snapshot: LoadedSessionSnapshot) => void;
  applyRemoteCharacterUpsert: (row: Record<string, unknown>) => void;
  removeRemoteCharacter: (characterId: string) => void;
  applyRemoteTokenUpsert: (token: Token) => void;
  removeRemoteToken: (tokenId: string) => void;
  appendRemoteChatMessage: (message: ChatMessage) => void;
  mergeRemoteChatMessage: (message: ChatMessage) => void;
  removeChatMessagesByIds: (ids: string[]) => void;
  beginOptimisticCharacterEdit: (characterId: string) => void;
  rollbackOptimisticCharacterEdit: (characterId: string) => void;
  clearOptimisticCharacterBackup: (characterId: string) => void;

  // Utility actions
  reset: () => void;
}

function hasNewSeveredLimbCondition(before: Character, after: Character): boolean {
  const prev = new Set((before.conditions ?? []).map((c) => c.name));
  for (const c of after.conditions ?? []) {
    if (!prev.has(c.name) && isSeveredConditionName(c.name)) return true;
  }
  return false;
}

// ============================================================================
// Helper: recalculate derived stats and apply to stat totals
// ============================================================================

function recalcCharacter(character: Character): Character {
  const updated = { ...character };
  syncArmorToHitLocations(updated);
  updated.derivedStats = calculateDerivedStats(updated);
  applyStatModifiers(updated);
  return updated;
}

function isSessionRecordingBroadcastPayload(
  payload: unknown,
): payload is { active: boolean; actorName?: string } {
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  if (typeof o.active !== 'boolean') return false;
  if (o.actorName !== undefined && typeof o.actorName !== 'string') return false;
  return true;
}

function voiceUiFieldsFromSessionSettings(
  settings: SessionSettings,
): Pick<
  GameState['ui'],
  'voiceInputMode' | 'sessionRecordingGroupActive' | 'sessionRecordingStartedBy'
> {
  return {
    voiceInputMode: settings.voiceInputMode,
    sessionRecordingGroupActive: settings.voiceInputMode === 'session',
    sessionRecordingStartedBy: settings.sessionRecordingStartedBy ?? null,
  };
}

/**
 * Emit a dice-type chat message describing an NPC's auto-resolved stun or death
 * save so the GM can see the roll vs. target without a modal. Used by the
 * auto-resolve helpers below — PCs still roll via the DiceRoller.
 */
function appendAutoSaveChatMessage(
  addChatMessage: (message: ChatMessage) => void,
  characterName: string,
  label: 'Stun save' | 'Death save',
  roll: number,
  target: number,
  success: boolean,
): void {
  const outcome =
    label === 'Death save'
      ? success
        ? 'survived'
        : 'DIED'
      : success
      ? 'stayed conscious'
      : 'STUNNED';
  addChatMessage({
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    speaker: characterName,
    text: `${label}: rolled ${roll} vs. ≤${target} — ${outcome}.`,
    timestamp: Date.now(),
    type: 'roll',
    metadata: { kind: 'auto_npc_save', label, roll, target, success },
  });
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: GameState = {
  session: {
    id: null,
    name: '',
    createdBy: null,
    createdAt: null,
    activeScene: null,
    settings: {
      ttsEnabled: true,
      ttsVoice: 'default',
      autoRollDamage: true,
      allowPlayerTokenMovement: true,
      voiceInputMode: 'pushToTalk',
      sessionRecordingStartedBy: null,
      sttLanguage: 'en',
      aiLanguage: 'en',
      mapGridCols: 20,
      mapGridRows: 20,
      mapShowGrid: true,
      mapSnapToGrid: true,
      mapMetersPerSquare: 5,
      activeScenarioId: null,
      gmOpenRouterModel: 'deepseek/deepseek-v3.2',
    },
    sessionSummary: '',
    combatState: null,
    soundtrackState: null,
    narrationImage: null,
    viewerUserId: null,
  },

  characters: {
    byId: {},
    allIds: [],
  },

  npcs: {
    byId: {},
    allIds: [],
  },

  map: {
    backgroundImageUrl: '',
    tokens: [],
    coverRegions: [],
    suppressiveZones: [],
    pendingSuppressivePlacements: [],
  },

  chat: {
    messages: [],
    isLoading: false,
  },

  sessionBroadcastSend: null,
  sessionCharacterPersist: null,

  ui: {
    selectedCharacterId: null,
    selectedTokenId: null,
    isDiceRollerOpen: false,
    diceFormula: null,
    includeSpecialAbilityInSkillRolls: false,
    diceRollIntent: null,
    pendingForcedDeathSaveFor: null,
    scheduleForcedDeathSaveOnDiceClose: null,
    isChatInputFocused: false,
    isVoiceRecording: false,
    pendingVoiceGm: null,
    voiceInputMode: 'pushToTalk',
    sessionRecordingGroupActive: false,
    sessionRecordingStartedBy: null,
    gmNarrationPending: false,
    startOfTurnDeathSaveAck: null,
    pendingRollsForVoice: [],
    sessionVoiceStopAllTick: 0,
    sessionVoiceStopTurnId: null,
    sessionVoicePeerStartTick: 0,
    pendingGmAttackRequest: null,
    lastAnsweredGmAttackRequestMessageId: null,
    pendingSuppressivePlacement: null,
    audioMusicVolume: 0.7,
    audioNarrationVolume: 0.85,
    narrationTtsCue: null,
  },

  realtime: {
    optimisticBackupByCharacterId: {},
    maxMergedCharacterRowUpdatedAtMs: {},
  },
};

// ============================================================================
// Store Creation
// ============================================================================

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...initialState,

  // Session actions
  setSession: (session) =>
    set((state) => {
      const nextSession = { ...state.session, ...session };
      let nextMap = state.map;
      if (session.combatState !== undefined) {
            const nz = reconcileSuppressiveZonesForCombat(state.map.suppressiveZones, nextSession.combatState);
        const prevZ = JSON.stringify(state.map.suppressiveZones);
        const nextZ = JSON.stringify(nz);
        if (prevZ !== nextZ) {
          nextMap = { ...state.map, suppressiveZones: nz };
          if (nz.length < state.map.suppressiveZones.length) {
            const sid = state.session.id;
            if (sid) {
              const mapPayload: SessionMapState = {
                coverRegions: nextMap.coverRegions,
                suppressiveZones: nz,
                pendingSuppressivePlacements: nextMap.pendingSuppressivePlacements,
              };
              void (async () => {
                const { supabase } = await import('../supabase');
                await supabase.from('sessions').update({ map_state: mapPayload }).eq('id', sid);
              })();
            }
          }
        }
      }
      return { session: nextSession, map: nextMap };
    }),

  setSessionViewerUserId: (userId) =>
    set((state) => ({
      session: { ...state.session, viewerUserId: userId },
    })),

  updateSessionSettings: (settings) =>
    set((state) => ({
      session: {
        ...state.session,
        settings: { ...state.session.settings, ...settings },
      },
    })),

  syncVoiceUiFromSessionSettings: (settings) =>
    set((state) => ({
      ui: {
        ...state.ui,
        ...voiceUiFieldsFromSessionSettings(settings),
      },
    })),

  setActiveScene: (scene) =>
    set((state) => ({
      session: { ...state.session, activeScene: scene },
    })),

  // Character actions
  addCharacter: (character) =>
    set((state) => {
      const withDerived = recalcCharacter(character);
      return {
        characters: {
          byId: { ...state.characters.byId, [character.id]: withDerived },
          allIds: [...state.characters.allIds, character.id],
        },
      };
    }),

  updateCharacter: (characterId, updates) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({ ...character, ...updates });
      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  removeCharacter: (characterId) =>
    set((state) => {
      const { [characterId]: _removed, ...remainingById } = state.characters.byId;
      return {
        characters: {
          byId: remainingById,
          allIds: state.characters.allIds.filter((id) => id !== characterId),
        },
      };
    }),

  /**
   * Full CP2020 damage pipeline (FNFF):
   * 1. Head hits: damage x2
   * 2. AP ammo: halve SP
   * 3. Subtract SP (ablation is applied ONLY when the attack penetrates SP)
   * 4. Subtract BTM (minimum 1 point if anything penetrated armor)
   * 5. Add remainder to damage total
   * 6. >8 damage to a limb → ensure Mortal 0 (forced death save next);
   *    >8 damage to Head → automatic death (damage = 41).
   * 7. If any damage landed and the character isn't already dead, auto-open
   *    the Stun Save roller so the book-required stun save isn't skipped.
   *
   * Point blank (FNFF): if pointBlank and weaponDamageFormula parse as NdS+M, base damage = max dice total.
   * Otherwise rawDamage is used (already your max if you typed it in manually).
   */
  applyDamage: (
    characterId,
    rawDamage,
    location,
    isAP = false,
    pointBlank = false,
    weaponDamageFormula = null,
    cover = null,
  ) => {
    let autoOpenStunFor: string | null = null;
    let queueForcedDeathFor: string | null = null;
    let targetIsNpc = false;
    set((state) => {
      const character =
        state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const isNpc = character.type === 'npc';
      targetIsNpc = isNpc;

      let effectiveRaw = rawDamage;
      if (pointBlank && weaponDamageFormula) {
        const maxD = maxDamageFromDiceFormula(weaponDamageFormula);
        if (maxD !== null) {
          effectiveRaw = maxD;
        }
      }

      const sp = location ? Math.max(0, character.hitLocations[location].stoppingPower - character.hitLocations[location].ablation) : 0;
      const btm = character.derivedStats?.btm || 0;
      const coverStacked = Math.max(0, Math.floor(cover?.stackedSp ?? 0));
      const coverRegionIds = cover?.regionIds?.length ? cover.regionIds : [];

      const result = calculateDamage(effectiveRaw, location, sp, btm, isAP, coverStacked);

      // Severance / head auto-kill escalate the final damage before applying.
      // Head: instant kill (damage 41). Limb: force Mortal 0 minimum (13).
      const addedDamage = result.finalDamage;
      let forcedDamageTotal: number | null = null;
      if (result.headAutoKill) {
        forcedDamageTotal = 41;
      } else if (result.limbSevered) {
        forcedDamageTotal = Math.max(character.damage + addedDamage, 13);
      }

      const newDamage =
        forcedDamageTotal !== null
          ? Math.min(41, Math.max(0, forcedDamageTotal))
          : Math.min(41, Math.max(0, character.damage + addedDamage));

      // Ablation: only on a penetrating hit (book: "attack that actually exceeds the armor's SP").
      let updatedHitLocations = character.hitLocations;
      if (location && character.hitLocations[location] && result.penetrated) {
        updatedHitLocations = {
          ...character.hitLocations,
          [location]: {
            ...character.hitLocations[location],
            ablation: character.hitLocations[location].ablation + 1,
          },
        };
      }

      // Persistent severance: on a limb-severing hit, add a `severed_<limb>`
      // condition so the Body tab, GM context, and save/load preserve it.
      let updatedConditions = character.conditions;
      if (result.limbSevered && location) {
        const sevName = severedConditionName(location);
        if (sevName && !updatedConditions.some((c) => c.name === sevName)) {
          updatedConditions = [...updatedConditions, { name: sevName, duration: null }];
        }
      }

      const tookDamage = newDamage > character.damage;
      const stillAlive = newDamage < 41;

      const updated = recalcCharacter({
        ...character,
        damage: newDamage,
        hitLocations: updatedHitLocations,
        conditions: updatedConditions,
        ...(tookDamage ? { isStabilized: false } : {}),
      });

      // Queue a stun save if the character actually took damage and isn't dead.
      // Per FNFF: "Every time a character takes damage, he must make a save."
      if (tookDamage && stillAlive) {
        autoOpenStunFor = characterId;
      }

      // FNFF limb severance (>8 final damage to a limb): forces an immediate
      // Mortal-0 death save. Head auto-kill sets damage to 41 (stillAlive=false),
      // so no death save to roll there.
      if (result.limbSevered && stillAlive) {
        queueForcedDeathFor = characterId;
      }

      // Only queue the forced death save in UI state for PCs (they roll in the
      // dice modal after resolving stun). NPCs auto-resolve inline below, so we
      // don't want a stale queue entry for them.
      const nextUi =
        queueForcedDeathFor !== null && !isNpc
          ? { ...state.ui, pendingForcedDeathSaveFor: queueForcedDeathFor }
          : state.ui;

      const ablateCover =
        result.penetrated &&
        coverRegionIds.length > 0 &&
        state.map.coverRegions.length > 0;
      const coverIdSet = ablateCover ? new Set(coverRegionIds) : null;
      const nextMap =
        coverIdSet !== null
          ? {
              ...state.map,
              coverRegions: state.map.coverRegions
                .map((r) =>
                  coverIdSet.has(r.id)
                    ? { ...r, spAblation: (r.spAblation ?? 0) + 1 }
                    : r,
                )
                // FNFF staged SP: at 0 the barrier is gone — drop the region from the tactical map.
                .filter((r) => (r.spAblation ?? 0) < coverTypeSp(r.coverTypeId)),
            }
          : state.map;

      if (isNpc) {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
          map: nextMap,
          ui: nextUi,
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
        map: nextMap,
        ui: nextUi,
      };
    });

    if (targetIsNpc) {
      // NPCs can't click a dice modal, so resolve saves automatically. Stun
      // first (if damage landed and they're alive); then, if a limb was
      // severed and they're still alive, the forced Mortal-0 death save.
      if (autoOpenStunFor) {
        get().autoResolveNpcStunSave(autoOpenStunFor);
      }
      if (queueForcedDeathFor) {
        const stillAlive = (get().npcs.byId[queueForcedDeathFor]?.damage ?? 41) < 41;
        if (stillAlive) {
          get().autoResolveNpcDeathSave(queueForcedDeathFor);
        }
      }
      const persist = get().sessionCharacterPersist;
      if (persist) {
        queueMicrotask(() => {
          persist(characterId);
        });
      }
      return;
    }

    if (autoOpenStunFor) {
      // PC path: open the roller so the player rolls. applyStunSaveRollResult
      // consumes pendingForcedDeathSaveFor and chains into the death save.
      get().beginStunSaveRoll(autoOpenStunFor);
    } else if (queueForcedDeathFor) {
      // Edge case: no stun save queued (e.g. damage didn't actually increase),
      // but severance still forces a death save. Consume immediately.
      set((s) => ({ ui: { ...s.ui, pendingForcedDeathSaveFor: null } }));
      get().beginDeathSaveRoll(queueForcedDeathFor, { ignoreStabilization: true });
    }
  },

  deductMoney: (characterId, amount) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const next = {
        ...character,
        eurobucks: Math.max(0, character.eurobucks - amount),
      };
      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: recalcCharacter(next) },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: {
            ...state.characters.byId,
            [characterId]: recalcCharacter(next),
          },
        },
      };
    }),

  addItem: (characterId, item) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        items: [...character.items, item],
      });

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  removeItem: (characterId, itemId) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        items: character.items.filter((item) => item.id !== itemId),
      });

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  sellItem: (characterId, itemId, sellFraction = 0.5) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const item = character.items.find((i) => i.id === itemId);
      if (!item) return state;

      const payout = Math.max(0, Math.floor(item.cost * (sellFraction <= 0 || sellFraction > 1 ? 0.5 : sellFraction)));

      const updated = recalcCharacter({
        ...character,
        eurobucks: character.eurobucks + payout,
        items: character.items.filter((i) => i.id !== itemId),
      });

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  updateCharacterField: (characterId, path, value) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const pathParts = path.split('.');
      const updatedCharacter = { ...character };

      let current: Record<string, unknown> = updatedCharacter as unknown as Record<string, unknown>;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        current[part] = { ...(current[part] as Record<string, unknown>) };
        current = current[part] as Record<string, unknown>;
      }

      const lastPart = pathParts[pathParts.length - 1];
      current[lastPart] = value;

      const updated = recalcCharacter(updatedCharacter);

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  // Skill actions
  addSkill: (characterId, skill) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        skills: [...character.skills, skill],
      });

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  updateSkill: (characterId, skillId, updates) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        skills: character.skills.map((s) => (s.id === skillId ? { ...s, ...updates } : s)),
      });

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  removeSkill: (characterId, skillId) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        skills: character.skills.filter((s) => s.id !== skillId),
      });

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  // Weapon actions
  fireWeapon: (characterId, weaponId, mode, opts) => {
    const state = get();
    const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
    if (!character) return false;

    const weaponIdx = character.items.findIndex((i) => i.id === weaponId && i.type === 'weapon');
    if (weaponIdx === -1) return false;

    const weapon = character.items[weaponIdx] as Weapon;
    const isMelee = weapon.weaponType === 'Melee';

    if (isMelee) return true;

    let ammoNeeded: number;
    if (mode === 'Suppressive' && opts?.suppressiveRounds != null) {
      const req = Math.floor(opts.suppressiveRounds);
      ammoNeeded = Math.max(1, Math.min(req, weapon.shotsLeft));
    } else {
      ammoNeeded = getAmmoConsumed(mode, weapon.rof);
    }
    if (weapon.shotsLeft < ammoNeeded) return false;

    const updatedItems = [...character.items];
    updatedItems[weaponIdx] = {
      ...weapon,
      shotsLeft: weapon.shotsLeft - ammoNeeded,
    };

    const isNpc = character.type === 'npc';
    const updated = recalcCharacter({ ...character, items: updatedItems });

    set((s) =>
      isNpc
        ? {
            npcs: {
              ...s.npcs,
              byId: { ...s.npcs.byId, [characterId]: updated },
            },
          }
        : {
            characters: {
              ...s.characters,
              byId: {
                ...s.characters.byId,
                [characterId]: updated,
              },
            },
          },
    );

    return true;
  },

  reloadWeapon: (characterId, weaponId) =>
    set((state) => {
      const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const updatedItems = character.items.map((item) => {
        if (item.id === weaponId && item.type === 'weapon') {
          const w = item;
          return { ...w, shotsLeft: w.shots };
        }
        return item;
      });

      const updated = recalcCharacter({ ...character, items: updatedItems });

      if (character.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: updated },
          },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: {
            ...state.characters.byId,
            [characterId]: updated,
          },
        },
      };
    }),

  // NPC actions
  addNPC: (npc) =>
    set((state) => {
      const withDerived = recalcCharacter(npc);
      return {
        npcs: {
          byId: { ...state.npcs.byId, [npc.id]: withDerived },
          allIds: [...state.npcs.allIds, npc.id],
        },
      };
    }),

  updateNPC: (npcId, updates) =>
    set((state) => {
      const npc = state.npcs.byId[npcId];
      if (!npc) return state;

      const updated = recalcCharacter({ ...npc, ...updates });
      return {
        npcs: {
          ...state.npcs,
          byId: { ...state.npcs.byId, [npcId]: updated },
        },
      };
    }),

  removeNPC: (npcId) =>
    set((state) => {
      const { [npcId]: _removed, ...remainingById } = state.npcs.byId;
      return {
        npcs: {
          byId: remainingById,
          allIds: state.npcs.allIds.filter((id) => id !== npcId),
        },
      };
    }),

  // Map actions
  setMapBackground: (url) =>
    set((state) => ({
      map: { ...state.map, backgroundImageUrl: url },
    })),

  setMapCoverRegions: (coverRegions) =>
    set((state) => ({
      map: { ...state.map, coverRegions },
    })),

  applySessionMapState: (mapState) =>
    set((state) => {
      const queue =
        mapState.pendingSuppressivePlacements !== undefined
          ? mapState.pendingSuppressivePlacements
          : state.map.pendingSuppressivePlacements;
      const head = queue[0] ?? null;
      return {
        map: {
          ...state.map,
          coverRegions: mapState.coverRegions,
          suppressiveZones: mapState.suppressiveZones,
          pendingSuppressivePlacements: queue,
        },
        ui: { ...state.ui, pendingSuppressivePlacement: head },
      };
    }),

  setPendingSuppressivePlacement: (p) =>
    set((state) => {
      const next = p == null ? [] : [p];
      return {
        map: { ...state.map, pendingSuppressivePlacements: next },
        ui: { ...state.ui, pendingSuppressivePlacement: next[0] ?? null },
      };
    }),

  saveSessionMapPendingSuppressive: (p) => {
    set((state) => {
      const next = [...state.map.pendingSuppressivePlacements, p];
      return {
        map: { ...state.map, pendingSuppressivePlacements: next },
        ui: { ...state.ui, pendingSuppressivePlacement: next[0] ?? null },
      };
    });
    const sid = get().session.id;
    if (!sid) return;
    void (async () => {
      const { persistSessionMapState } = await import('../session/persist-session-map-state');
      const { supabase } = await import('../supabase');
      await persistSessionMapState(supabase, sid, {
        pendingSuppressivePlacements: get().map.pendingSuppressivePlacements,
      });
    })();
  },

  evaluateSuppressiveFireForTokenCell: (tokenId, cellC, cellR) => {
    const state = get();
    const token = state.map.tokens.find((t) => t.id === tokenId);
    const cid = token?.characterId?.trim();
    if (!cid) return;
    for (const z of state.map.suppressiveZones) {
      if (z.ownerCharacterId === cid) continue;
      if (cellInsideSuppressiveZone(cellC, cellR, z)) {
        resolveSuppressiveZoneEntry(cid, z);
      }
    }
  },

  addToken: (token) =>
    set((state) => ({
      map: { ...state.map, tokens: [...state.map.tokens, token] },
    })),

  moveToken: (tokenId, x, y) =>
    set((state) => ({
      map: {
        ...state.map,
        tokens: state.map.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)),
      },
    })),

  removeToken: (tokenId) =>
    set((state) => ({
      map: {
        ...state.map,
        tokens: state.map.tokens.filter((t) => t.id !== tokenId),
      },
    })),

  // Chat actions
  addChatMessage: (message) =>
    set((state) => {
      if (state.chat.messages.some((m) => m.id === message.id)) return state;
      return {
        chat: { ...state.chat, messages: [...state.chat.messages, message] },
      };
    }),

  setChatLoading: (isLoading) =>
    set((state) => ({
      chat: { ...state.chat, isLoading },
    })),

  clearChatHistory: () =>
    set((state) => ({
      chat: { ...state.chat, messages: [] },
      ui: {
        ...state.ui,
        pendingGmAttackRequest: null,
        lastAnsweredGmAttackRequestMessageId: null,
      },
    })),

  // UI actions
  selectCharacter: (characterId) =>
    set((state) => ({
      ui: { ...state.ui, selectedCharacterId: characterId },
    })),

  selectToken: (tokenId) =>
    set((state) => ({
      ui: { ...state.ui, selectedTokenId: tokenId },
    })),

  openDiceRoller: (formula, intent = null) =>
    set((state) => ({
      ui: {
        ...state.ui,
        isDiceRollerOpen: true,
        diceFormula: formula,
        diceRollIntent: intent ?? null,
      },
    })),

  closeDiceRoller: () => {
    const sched = get().ui.scheduleForcedDeathSaveOnDiceClose;
    set((state) => ({
      ui: {
        ...state.ui,
        isDiceRollerOpen: false,
        diceFormula: null,
        diceRollIntent: null,
        pendingForcedDeathSaveFor: null,
        scheduleForcedDeathSaveOnDiceClose: null,
      },
    }));
    if (sched) {
      queueMicrotask(() => {
        const c = get().characters.byId[sched] ?? get().npcs.byId[sched];
        if ((c?.derivedStats?.deathSaveTarget ?? -1) >= 0) {
          get().beginDeathSaveRoll(sched, { ignoreStabilization: true });
        }
      });
    }
  },

  beginStunSaveRoll: (characterId) => {
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    if (!char?.derivedStats) return;
    const bonus = char.combatModifiers?.stunSave ?? 0;
    const saveTarget = char.derivedStats.stunSaveTarget + bonus;
    const sessionId = get().session.id;
    set((state) => ({
      ui: {
        ...state.ui,
        scheduleForcedDeathSaveOnDiceClose: null,
        isDiceRollerOpen: true,
        diceFormula: 'flat:1d10',
        diceRollIntent: {
          characterId,
          kind: 'stun',
          saveTarget,
          sessionId: sessionId ?? undefined,
          speakerName: char?.name,
          rollSummary: 'Stun save',
        },
      },
    }));
  },

  beginStunOverrideRequest: (characterId) => {
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    if (!char) return;
    const sessionId = get().session.id;
    set((state) => ({
      ui: {
        ...state.ui,
        isDiceRollerOpen: true,
        diceFormula: 'request:stun_override',
        diceRollIntent: {
          kind: 'stun_override_request',
          characterId,
          sessionId: sessionId ?? undefined,
          speakerName: char.name,
          rollSummary: 'Stun override (Ask AI-GM)',
        },
      },
    }));
  },

  beginStunRecoveryRoll: (characterId) => {
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    if (!char?.isStunned || !char.derivedStats) return;
    const bonus = char.combatModifiers?.stunSave ?? 0;
    const saveTarget = char.derivedStats.stunSaveTarget + bonus;
    const sessionId = get().session.id;
    set((state) => ({
      ui: {
        ...state.ui,
        scheduleForcedDeathSaveOnDiceClose: null,
        isDiceRollerOpen: true,
        diceFormula: 'flat:1d10',
        diceRollIntent: {
          characterId,
          kind: 'stun_recovery',
          saveTarget,
          sessionId: sessionId ?? undefined,
          speakerName: char?.name,
          rollSummary: 'Stun recovery',
        },
      },
    }));
  },

  beginDeathSaveRoll: (characterId, options) => {
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    const target = char?.derivedStats?.deathSaveTarget ?? -1;
    if (target < 0) return;
    if (!options?.ignoreStabilization && char?.isStabilized) return;
    const sessionId = get().session.id;
    const saveTarget = target + deathSaveBonusFromMods(char.combatModifiers);
    set((state) => ({
      ui: {
        ...state.ui,
        scheduleForcedDeathSaveOnDiceClose: null,
        isDiceRollerOpen: true,
        diceFormula: 'flat:1d10',
        diceRollIntent: {
          characterId,
          kind: 'death',
          saveTarget,
          sessionId: sessionId ?? undefined,
          speakerName: char?.name,
          rollSummary: 'Death save',
        },
      },
    }));
  },

  clearDiceRollIntent: () =>
    set((state) => ({
      ui: { ...state.ui, diceRollIntent: null },
    })),

  applyStunSaveRollResult: (characterId, flatRollTotal) => {
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    if (!char?.derivedStats) return;
    const bonus = char.combatModifiers?.stunSave ?? 0;
    const target = char.derivedStats.stunSaveTarget + bonus;
    const success = isFlatSaveSuccess(flatRollTotal, target);
    get().updateCharacterField(characterId, 'isStunned', !success);

    // Forced Mortal-0 death save (limb sever): open only after the player closes
    // the stun roller so isStunned is settled first.
    const pending = get().ui.pendingForcedDeathSaveFor;
    if (pending && pending === characterId) {
      const updatedChar = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
      const needsForcedDeath = (updatedChar?.derivedStats?.deathSaveTarget ?? -1) >= 0;
      set((s) => ({
        ui: {
          ...s.ui,
          pendingForcedDeathSaveFor: null,
          scheduleForcedDeathSaveOnDiceClose: needsForcedDeath ? characterId : null,
        },
      }));
    }
  },

  applyStunRecoveryRollResult: (characterId, flatRollTotal) => {
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    if (!char?.derivedStats) return;
    const bonus = char.combatModifiers?.stunSave ?? 0;
    const target = char.derivedStats.stunSaveTarget + bonus;
    const success = isFlatSaveSuccess(flatRollTotal, target);
    get().updateCharacterField(characterId, 'isStunned', !success);

    const pendingTurn = get().session.combatState?.startOfTurnSavesPendingFor;
    if (pendingTurn !== characterId) return;

    const updatedChar = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    const needsDeath =
      (updatedChar?.derivedStats?.deathSaveTarget ?? -1) >= 0 && !updatedChar?.isStabilized;

    if (needsDeath) {
      set((s) => ({
        ui: {
          ...s.ui,
          startOfTurnDeathSaveAck: { characterId },
          scheduleForcedDeathSaveOnDiceClose: null,
        },
      }));
      get().closeDiceRoller();
    } else {
      void get().clearStartOfTurnSavesPendingRemote();
    }
  },

  applyDeathSaveRollResult: (characterId, flatRollTotal) => {
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    if (!char?.derivedStats) return;
    const target = char.derivedStats.deathSaveTarget + deathSaveBonusFromMods(char.combatModifiers);
    if (char.derivedStats.deathSaveTarget < 0) return;
    if (char.isStabilized) return;
    if (!isFlatSaveSuccess(flatRollTotal, target)) {
      get().updateCharacterField(characterId, 'damage', 41);
    }
    const pendingTurn = get().session.combatState?.startOfTurnSavesPendingFor;
    if (pendingTurn === characterId) {
      void get().clearStartOfTurnSavesPendingRemote();
    }
    set((s) => ({
      ui: {
        ...s.ui,
        startOfTurnDeathSaveAck:
          s.ui.startOfTurnDeathSaveAck?.characterId === characterId
            ? null
            : s.ui.startOfTurnDeathSaveAck,
      },
    }));
  },

  proceedStartOfTurnDeathSaveAfterAck: () => {
    const id = get().ui.startOfTurnDeathSaveAck?.characterId;
    if (!id) return;
    set((s) => ({ ui: { ...s.ui, startOfTurnDeathSaveAck: null } }));
    get().beginDeathSaveRoll(id);
  },

  dismissStartOfTurnDeathSaveAck: () =>
    set((s) => ({ ui: { ...s.ui, startOfTurnDeathSaveAck: null } })),

  openStartOfTurnSavesIfNeeded: (characterId) => {
    if (get().ui.isDiceRollerOpen) return;
    if (get().ui.startOfTurnDeathSaveAck?.characterId === characterId) return;
    const char = get().characters.byId[characterId] ?? get().npcs.byId[characterId];
    if (!char) return;
    if (char.isStunned) {
      get().beginStunRecoveryRoll(characterId);
      return;
    }
    const needsDeath =
      (char.derivedStats?.deathSaveTarget ?? -1) >= 0 && !char.isStabilized;
    if (needsDeath) {
      get().beginDeathSaveRoll(characterId);
    }
  },

  clearStartOfTurnSavesPendingRemote: async () => {
    const sessionId = get().session.id?.trim();
    if (!sessionId) return;
    const { supabase } = await import('../supabase');
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/combat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'clear_turn_saves_pending' }),
    });
    const j = (await res.json().catch(() => ({}))) as { combat_state?: unknown };
    if (!res.ok) return;
    if (j.combat_state !== undefined && j.combat_state !== null) {
      const parsed = parseCombatStateJson(j.combat_state);
      if (parsed) {
        set((s) => ({ session: { ...s.session, combatState: parsed } }));
      }
    }
  },

  applyStabilizationRollResult: (patientCharacterId, success, detail) => {
    const char =
      get().characters.byId[patientCharacterId] ?? get().npcs.byId[patientCharacterId];
    const patientName = char?.name ?? 'Patient';
    if (success) {
      get().updateCharacterField(patientCharacterId, 'isStabilized', true);
    }
    get().addChatMessage({
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      speaker: patientName,
      text: `Stabilization: medic total ${detail.rollTotal} vs. ≥${detail.targetDamage} (patient damage) — ${
        success
          ? 'STABILIZED (ongoing death saves suppressed until new damage).'
          : 'failed.'
      }`,
      timestamp: Date.now(),
      type: 'roll',
      metadata: {
        kind: 'stabilization',
        patientCharacterId,
        success,
        rollTotal: detail.rollTotal,
        targetDamage: detail.targetDamage,
      },
    });
  },

  autoResolveNpcStunSave: (characterId) => {
    const char = get().npcs.byId[characterId] ?? get().characters.byId[characterId];
    if (!char?.derivedStats) return null;
    const bonus = char.combatModifiers?.stunSave ?? 0;
    const target = char.derivedStats.stunSaveTarget + bonus;
    const roll = Math.floor(Math.random() * 10) + 1;
    const success = isFlatSaveSuccess(roll, target);
    get().updateCharacterField(characterId, 'isStunned', !success);
    appendAutoSaveChatMessage(get().addChatMessage, char.name, 'Stun save', roll, target, success);
    return { roll, target, success };
  },

  autoResolveNpcDeathSave: (characterId) => {
    const char = get().npcs.byId[characterId] ?? get().characters.byId[characterId];
    if (!char?.derivedStats) return null;
    if (char.derivedStats.deathSaveTarget < 0) return null;
    if (char.isStabilized) return null;
    const target = char.derivedStats.deathSaveTarget + deathSaveBonusFromMods(char.combatModifiers);
    const roll = Math.floor(Math.random() * 10) + 1;
    const success = isFlatSaveSuccess(roll, target);
    if (!success) {
      get().updateCharacterField(characterId, 'damage', 41);
    }
    appendAutoSaveChatMessage(get().addChatMessage, char.name, 'Death save', roll, target, success);
    return { roll, target, success };
  },

  setIncludeSpecialAbilityInSkillRolls: (include) =>
    set((state) => ({
      ui: { ...state.ui, includeSpecialAbilityInSkillRolls: include },
    })),

  setVoiceRecording: (isRecording) =>
    set((state) => ({
      ui: { ...state.ui, isVoiceRecording: isRecording },
    })),

  setPendingVoiceGm: (payload) =>
    set((state) => ({
      ui: { ...state.ui, pendingVoiceGm: payload },
    })),

  clearPendingVoiceGm: () =>
    set((state) => ({
      ui: { ...state.ui, pendingVoiceGm: null },
    })),

  setVoiceInputMode: (mode) =>
    set((state) => ({
      ui: { ...state.ui, voiceInputMode: mode },
    })),

  setGmNarrationPending: (pending) =>
    set((state) => ({
      ui: { ...state.ui, gmNarrationPending: pending },
    })),

  addPendingRollForVoice: (entry) =>
    set((state) => ({
      ui: { ...state.ui, pendingRollsForVoice: [...state.ui.pendingRollsForVoice, entry] },
    })),

  removePendingRollForVoice: (id) =>
    set((state) => ({
      ui: {
        ...state.ui,
        pendingRollsForVoice: state.ui.pendingRollsForVoice.filter((r) => r.id !== id),
      },
    })),

  clearPendingRollsForVoice: () =>
    set((state) => ({
      ui: { ...state.ui, pendingRollsForVoice: [] },
    })),

  clearPendingRollsForSession: (sessionId) =>
    set((state) => ({
      ui: {
        ...state.ui,
        pendingRollsForVoice: state.ui.pendingRollsForVoice.filter((r) => r.sessionId !== sessionId),
      },
    })),

  setPendingGmAttackRequest: (payload) =>
    set((state) => ({
      ui: { ...state.ui, pendingGmAttackRequest: payload },
    })),

  ackGmAttackRollReply: (chatMessageId) =>
    set((state) => ({
      ui: {
        ...state.ui,
        pendingGmAttackRequest: null,
        lastAnsweredGmAttackRequestMessageId: chatMessageId,
      },
    })),

  registerSessionBroadcastSend: (fn) => set({ sessionBroadcastSend: fn }),
  registerSessionCharacterPersist: (fn) => set({ sessionCharacterPersist: fn }),

  broadcastSessionRecordingState: async ({ active, actorName }) => {
    const send = get().sessionBroadcastSend;
    if (!send) return;
    await send(BROADCAST_EVENTS.SESSION_RECORDING, {
      active,
      actorName,
      ts: Date.now(),
    });
  },

  applySessionRecordingBroadcast: (payload) => {
    if (!isSessionRecordingBroadcastPayload(payload)) return;
    const { active, actorName } = payload;
    set((state) => ({
      ui: {
        ...state.ui,
        voiceInputMode: active ? 'session' : 'pushToTalk',
        sessionRecordingGroupActive: active,
        sessionRecordingStartedBy: active ? (actorName ?? 'Someone') : null,
      },
    }));
  },

  broadcastSessionVoiceStopAll: async (turnId) => {
    const send = get().sessionBroadcastSend;
    if (!send) return;
    await send(BROADCAST_EVENTS.SESSION_VOICE_STOP_ALL, { ts: Date.now(), turnId });
  },

  bumpSessionVoiceStopAllFromBroadcast: (payload) => {
    let turnId: string | null = null;
    if (payload && typeof payload === 'object' && 'turnId' in payload) {
      const t = (payload as Record<string, unknown>).turnId;
      if (typeof t === 'string' && t.length > 0) turnId = t;
    }
    set((state) => ({
      ui: {
        ...state.ui,
        sessionVoiceStopAllTick: state.ui.sessionVoiceStopAllTick + 1,
        sessionVoiceStopTurnId: turnId,
      },
    }));
  },

  broadcastSessionVoicePeerStart: async () => {
    const send = get().sessionBroadcastSend;
    if (!send) return;
    await send(BROADCAST_EVENTS.SESSION_VOICE_PEER_START, { ts: Date.now() });
  },

  bumpSessionVoicePeerStartFromBroadcast: () =>
    set((state) => ({
      ui: {
        ...state.ui,
        sessionVoicePeerStartTick: state.ui.sessionVoicePeerStartTick + 1,
      },
    })),

  hydrateLocalAudioVolumes: () => {
    if (typeof window === 'undefined') return;
    let music = initialState.ui.audioMusicVolume;
    let narration = initialState.ui.audioNarrationVolume;
    try {
      const rawM = localStorage.getItem(LS_AUDIO_MUSIC_VOL);
      const rawN = localStorage.getItem(LS_AUDIO_NARRATION_VOL);
      if (rawM != null) music = clampUnitVolume(parseFloat(rawM), music);
      if (rawN != null) narration = clampUnitVolume(parseFloat(rawN), narration);
    } catch {
      /* ignore */
    }
    set((state) => ({
      ui: {
        ...state.ui,
        audioMusicVolume: music,
        audioNarrationVolume: narration,
      },
    }));
  },

  setAudioMusicVolume: (volume) => {
    const v = clampUnitVolume(volume, initialState.ui.audioMusicVolume);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_AUDIO_MUSIC_VOL, String(v));
      } catch {
        /* ignore */
      }
    }
    set((state) => ({ ui: { ...state.ui, audioMusicVolume: v } }));
  },

  setAudioNarrationVolume: (volume) => {
    const v = clampUnitVolume(volume, initialState.ui.audioNarrationVolume);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_AUDIO_NARRATION_VOL, String(v));
      } catch {
        /* ignore */
      }
    }
    set((state) => ({ ui: { ...state.ui, audioNarrationVolume: v } }));
  },

  broadcastSessionNarrationTtsPlay: async ({ messageId, playAtMs }) => {
    const send = get().sessionBroadcastSend;
    if (!send) return;
    await send(BROADCAST_EVENTS.SESSION_NARRATION_TTS, { messageId, playAtMs });
  },

  applySessionNarrationTtsFromBroadcast: (payload) => {
    if (!payload || typeof payload !== 'object') return;
    const o = payload as Record<string, unknown>;
    const messageId = o.messageId;
    const playAtMs = o.playAtMs;
    if (typeof messageId !== 'string' || messageId.length === 0) return;
    if (typeof playAtMs !== 'number' || !Number.isFinite(playAtMs)) return;
    set((state) => ({
      ui: {
        ...state.ui,
        narrationTtsCue: {
          seq: (state.ui.narrationTtsCue?.seq ?? 0) + 1,
          messageId,
          playAtMs,
        },
      },
    }));
  },

  hydrateFromLoadedSnapshot: (snapshot) =>
    set((state) => {
      const byIdChar: Record<string, Character> = {};
      const allIdsChar: string[] = [];
      const byIdNpc: Record<string, Character> = {};
      const allIdsNpc: string[] = [];

      for (const c of snapshot.characters) {
        const rec = recalcCharacter(c);
        if (rec.type === 'npc') {
          byIdNpc[rec.id] = rec;
          allIdsNpc.push(rec.id);
        } else {
          byIdChar[rec.id] = rec;
          allIdsChar.push(rec.id);
        }
      }

      return {
        session: {
          id: snapshot.session.id,
          name: snapshot.session.name,
          createdBy: snapshot.session.createdBy,
          createdAt: snapshot.session.createdAt,
          activeScene: snapshot.session.activeScene,
          settings: snapshot.session.settings,
          sessionSummary: snapshot.session.sessionSummary,
          combatState: snapshot.session.combatState,
          soundtrackState: snapshot.session.soundtrackState,
          narrationImage: snapshot.session.narrationImage,
          viewerUserId: state.session.viewerUserId,
        },
        characters: { byId: byIdChar, allIds: allIdsChar },
        npcs: { byId: byIdNpc, allIds: allIdsNpc },
        map: {
          backgroundImageUrl: snapshot.session.mapBackgroundUrl,
          tokens: snapshot.tokens,
          coverRegions: snapshot.session.mapState.coverRegions,
          suppressiveZones: snapshot.session.mapState.suppressiveZones,
          pendingSuppressivePlacements: snapshot.session.mapState.pendingSuppressivePlacements,
        },
        chat: {
          messages: snapshot.chatMessages,
          isLoading: false,
        },
        ui: {
          ...state.ui,
          ...voiceUiFieldsFromSessionSettings(snapshot.session.settings),
          startOfTurnDeathSaveAck: null,
          scheduleForcedDeathSaveOnDiceClose: null,
          sessionVoiceStopAllTick: 0,
          sessionVoicePeerStartTick: 0,
          pendingGmAttackRequest: null,
          lastAnsweredGmAttackRequestMessageId: null,
          pendingSuppressivePlacement: snapshot.session.mapState.pendingSuppressivePlacements[0] ?? null,
        },
        realtime: { optimisticBackupByCharacterId: {}, maxMergedCharacterRowUpdatedAtMs: {} },
      };
    }),

  applyRemoteCharacterUpsert: (row) => {
    let openRemoteDamageStunFor: string | null = null;
    let remoteForcedDeathFor: string | null = null;

    set((state) => {
      const parsed = characterRowToCharacter(row);
      const existing = state.characters.byId[parsed.id] ?? state.npcs.byId[parsed.id];
      const maxApplied = state.realtime.maxMergedCharacterRowUpdatedAtMs[parsed.id] ?? null;
      const merged = existing
        ? mergeCharacterRowWithRealtime(existing, row, { maxAppliedRowUpdatedAtMs: maxApplied })
        : parsed;
      const rec = recalcCharacter(merged);
      const rowTs = postgresRowUpdatedAtMs(row);
      const prevMax = state.realtime.maxMergedCharacterRowUpdatedAtMs[rec.id] ?? 0;
      const nextMaxMerged =
        rowTs != null
          ? { ...state.realtime.maxMergedCharacterRowUpdatedAtMs, [rec.id]: Math.max(prevMax, rowTs) }
          : state.realtime.maxMergedCharacterRowUpdatedAtMs;
      const realtimePatch = {
        ...state.realtime,
        maxMergedCharacterRowUpdatedAtMs: nextMaxMerged,
      };

      const viewerId = state.session.viewerUserId;
      const ownedPc =
        rec.type === 'character' && !!viewerId && rec.userId === viewerId;
      const damageIncreased =
        !!existing &&
        'damage' in row &&
        rec.damage > existing.damage &&
        rec.damage < 41;
      if (ownedPc && damageIncreased && existing) {
        openRemoteDamageStunFor = rec.id;
        if (hasNewSeveredLimbCondition(existing, rec)) {
          remoteForcedDeathFor = rec.id;
        }
      }

      let uiPatch = state.ui;
      if (remoteForcedDeathFor) {
        uiPatch = { ...state.ui, pendingForcedDeathSaveFor: remoteForcedDeathFor };
      }

      if (rec.type === 'npc') {
        const exists = state.npcs.allIds.includes(rec.id);
        return {
          npcs: {
            byId: { ...state.npcs.byId, [rec.id]: rec },
            allIds: exists ? state.npcs.allIds : [...state.npcs.allIds, rec.id],
          },
          realtime: realtimePatch,
          ui: uiPatch,
        };
      }
      const exists = state.characters.allIds.includes(rec.id);
      return {
        characters: {
          byId: { ...state.characters.byId, [rec.id]: rec },
          allIds: exists ? state.characters.allIds : [...state.characters.allIds, rec.id],
        },
        realtime: realtimePatch,
        ui: uiPatch,
      };
    });

    if (openRemoteDamageStunFor) {
      queueMicrotask(() => {
        get().beginStunSaveRoll(openRemoteDamageStunFor!);
      });
    }
  },

  removeRemoteCharacter: (characterId) =>
    set((state) => {
      const restMax = { ...state.realtime.maxMergedCharacterRowUpdatedAtMs };
      delete restMax[characterId];
      const rt = { ...state.realtime, maxMergedCharacterRowUpdatedAtMs: restMax };
      if (characterId in state.characters.byId) {
        const byId = { ...state.characters.byId };
        delete byId[characterId];
        return {
          characters: {
            byId,
            allIds: state.characters.allIds.filter((id) => id !== characterId),
          },
          realtime: rt,
        };
      }
      if (characterId in state.npcs.byId) {
        const byId = { ...state.npcs.byId };
        delete byId[characterId];
        return {
          npcs: {
            byId,
            allIds: state.npcs.allIds.filter((id) => id !== characterId),
          },
          realtime: rt,
        };
      }
      return state;
    }),

  applyRemoteTokenUpsert: (token) =>
    set((state) => {
      const idx = state.map.tokens.findIndex((t) => t.id === token.id);
      if (idx === -1) {
        return { map: { ...state.map, tokens: [...state.map.tokens, token] } };
      }
      const next = [...state.map.tokens];
      next[idx] = token;
      return { map: { ...state.map, tokens: next } };
    }),

  removeRemoteToken: (tokenId) =>
    set((state) => ({
      map: {
        ...state.map,
        tokens: state.map.tokens.filter((t) => t.id !== tokenId),
      },
    })),

  appendRemoteChatMessage: (message) =>
    set((state) => {
      if (state.chat.messages.some((m) => m.id === message.id)) return state;
      const nextMessages = [...state.chat.messages, message];
      const clearGmPending =
        message.type === 'narration' &&
        message.speaker === 'Game Master' &&
        state.ui.gmNarrationPending;
      return {
        chat: { ...state.chat, messages: nextMessages },
        ui: clearGmPending ? { ...state.ui, gmNarrationPending: false } : state.ui,
      };
    }),

  mergeRemoteChatMessage: (message) =>
    set((state) => {
      const idx = state.chat.messages.findIndex((m) => m.id === message.id);
      const next =
        idx === -1
          ? [...state.chat.messages, message]
          : state.chat.messages.map((m) => (m.id === message.id ? message : m));
      return {
        chat: { ...state.chat, messages: sortChatMessagesByTimestamp(next) },
      };
    }),

  removeChatMessagesByIds: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      if (idSet.size === 0) return state;
      const next = state.chat.messages.filter((m) => !idSet.has(m.id));
      if (next.length === state.chat.messages.length) return state;
      let ui = state.ui;
      if (ui.pendingGmAttackRequest?.chatMessageId && idSet.has(ui.pendingGmAttackRequest.chatMessageId)) {
        ui = { ...ui, pendingGmAttackRequest: null };
      }
      if (
        ui.lastAnsweredGmAttackRequestMessageId &&
        idSet.has(ui.lastAnsweredGmAttackRequestMessageId)
      ) {
        ui = { ...ui, lastAnsweredGmAttackRequestMessageId: null };
      }
      return { chat: { ...state.chat, messages: next }, ui };
    }),

  beginOptimisticCharacterEdit: (characterId) =>
    set((state) => {
      const c = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!c) return state;
      return {
        realtime: {
          ...state.realtime,
          optimisticBackupByCharacterId: {
            ...state.realtime.optimisticBackupByCharacterId,
            [characterId]: { ...c },
          },
        },
      };
    }),

  rollbackOptimisticCharacterEdit: (characterId) =>
    set((state) => {
      const backup = state.realtime.optimisticBackupByCharacterId[characterId];
      if (!backup) return state;
      const rest = { ...state.realtime.optimisticBackupByCharacterId };
      delete rest[characterId];
      if (backup.type === 'npc') {
        return {
          npcs: {
            ...state.npcs,
            byId: { ...state.npcs.byId, [characterId]: backup },
          },
          realtime: { ...state.realtime, optimisticBackupByCharacterId: rest },
        };
      }
      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: backup },
        },
        realtime: { ...state.realtime, optimisticBackupByCharacterId: rest },
      };
    }),

  clearOptimisticCharacterBackup: (characterId) =>
    set((state) => {
      const rest = { ...state.realtime.optimisticBackupByCharacterId };
      delete rest[characterId];
      return { realtime: { ...state.realtime, optimisticBackupByCharacterId: rest } };
    }),

  reset: () => set(initialState),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectAllCharacters = (state: GameState & GameActions): Character[] => {
  return state.characters.allIds.map((id) => state.characters.byId[id]);
};

export const selectCharacterById = (
  state: GameState & GameActions,
  characterId: string,
): Character | undefined => {
  return state.characters.byId[characterId] ?? state.npcs.byId[characterId];
};

export const selectSelectedCharacter = (state: GameState & GameActions): Character | undefined => {
  if (!state.ui.selectedCharacterId) return undefined;
  const id = state.ui.selectedCharacterId;
  return state.characters.byId[id] ?? state.npcs.byId[id];
};

export const selectAllNPCs = (state: GameState & GameActions): Character[] => {
  return state.npcs.allIds.map((id) => state.npcs.byId[id]);
};

export const selectNPCById = (
  state: GameState & GameActions,
  npcId: string,
): Character | undefined => {
  return state.npcs.byId[npcId];
};

export const selectAllTokens = (state: GameState & GameActions): Token[] => {
  return state.map.tokens;
};

export const selectTokenById = (
  state: GameState & GameActions,
  tokenId: string,
): Token | undefined => {
  return state.map.tokens.find((t) => t.id === tokenId);
};

export const selectSelectedToken = (state: GameState & GameActions): Token | undefined => {
  if (!state.ui.selectedTokenId) return undefined;
  return state.map.tokens.find((t) => t.id === state.ui.selectedTokenId);
};

export const selectAllChatMessages = (state: GameState & GameActions): ChatMessage[] => {
  return state.chat.messages;
};

export const selectRecentChatMessages = (
  state: GameState & GameActions,
  count: number,
): ChatMessage[] => {
  return state.chat.messages.slice(-count);
};

export const selectCharacterDerivedStats = (
  state: GameState & GameActions,
  characterId: string,
): DerivedStats | undefined => {
  return (
    state.characters.byId[characterId]?.derivedStats ?? state.npcs.byId[characterId]?.derivedStats
  );
};

export const selectCanAfford = (
  state: GameState & GameActions,
  characterId: string,
  cost: number,
): boolean => {
  const character = state.characters.byId[characterId] ?? state.npcs.byId[characterId];
  if (!character) return false;
  return character.eurobucks >= cost;
};

export const selectSession = (state: GameState & GameActions) => state.session;

export const selectActiveScene = (state: GameState & GameActions): Scene | null => {
  return state.session.activeScene;
};

export const selectSessionSettings = (state: GameState & GameActions): SessionSettings => {
  return state.session.settings;
};
