/**
 * Zustand store for client-side game state management
 * Manages characters, session, map, chat, and UI state
 */

import { create } from 'zustand';
import {
  Character,
  Session,
  Token,
  ChatMessage,
  Scene,
  SessionSettings,
  Item,
  Skill,
  DerivedStats,
  Zone,
  Weapon,
  FireMode,
  DiceRollIntent,
} from '../types';
import {
  calculateDerivedStats,
  applyStatModifiers,
  syncArmorToHitLocations,
  calculateDamage,
  isFlatSaveSuccess,
} from '../game-logic/formulas';
import { maxDamageFromDiceFormula } from '../game-logic/dice';
import { getAmmoConsumed } from '../game-logic/lookups';
import type { LoadedSessionSnapshot } from '../realtime/session-load';

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
  };

  chat: {
    messages: ChatMessage[];
    isLoading: boolean;
  };

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
    isChatInputFocused: boolean;
    isVoiceRecording: boolean;
  };

  /** Optimistic edit backups for Supabase writes (rollback on RLS/error). */
  realtime: {
    optimisticBackupByCharacterId: Record<string, Character>;
  };
}

// ============================================================================
// Actions Interface
// ============================================================================

interface GameActions {
  // Session actions
  setSession: (session: Partial<Session>) => void;
  updateSessionSettings: (settings: Partial<SessionSettings>) => void;
  setActiveScene: (scene: Scene) => void;

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
  ) => void;

  deductMoney: (characterId: string, amount: number) => void;
  addItem: (characterId: string, item: Item) => void;
  removeItem: (characterId: string, itemId: string) => void;
  /** Sell item for a fraction of list price (default 50%). Adds eurobucks and removes item. */
  sellItem: (characterId: string, itemId: string, sellFraction?: number) => void;
  updateCharacterField: (characterId: string, path: string, value: unknown) => void;

  // Skill actions
  addSkill: (characterId: string, skill: Skill) => void;
  updateSkill: (characterId: string, skillId: string, updates: Partial<Skill>) => void;
  removeSkill: (characterId: string, skillId: string) => void;

  // Weapon actions
  fireWeapon: (characterId: string, weaponId: string, mode: FireMode) => boolean;
  reloadWeapon: (characterId: string, weaponId: string) => void;

  // NPC actions
  addNPC: (npc: Character) => void;
  updateNPC: (npcId: string, updates: Partial<Character>) => void;
  removeNPC: (npcId: string) => void;

  // Map actions
  setMapBackground: (url: string) => void;
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
  /** Open flat d10 with intent (only if mortally wounded); fail kills the character. */
  beginDeathSaveRoll: (characterId: string) => void;
  clearDiceRollIntent: () => void;
  /** Apply stun save from a flat d10 total (for AI / automation). Uses derived stun target + combatModifiers.stunSave. */
  applyStunSaveRollResult: (characterId: string, flatRollTotal: number) => void;
  /**
   * Apply death save from a flat d10 total (for AI / automation).
   * Fail → damage 41 (Dead on wound track). Per FNFF: failed death save while Mortally wounded means death;
   * we represent that as the Dead state (damage ≥ 41), not a separate flag.
   */
  applyDeathSaveRollResult: (characterId: string, flatRollTotal: number) => void;
  setVoiceRecording: (isRecording: boolean) => void;

  // Supabase Realtime / session sync
  hydrateFromLoadedSnapshot: (snapshot: LoadedSessionSnapshot) => void;
  applyRemoteCharacterUpsert: (character: Character) => void;
  removeRemoteCharacter: (characterId: string) => void;
  applyRemoteTokenUpsert: (token: Token) => void;
  removeRemoteToken: (tokenId: string) => void;
  appendRemoteChatMessage: (message: ChatMessage) => void;
  beginOptimisticCharacterEdit: (characterId: string) => void;
  rollbackOptimisticCharacterEdit: (characterId: string) => void;
  clearOptimisticCharacterBackup: (characterId: string) => void;

  // Utility actions
  reset: () => void;
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
    },
    sessionSummary: '',
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
  },

  chat: {
    messages: [],
    isLoading: false,
  },

  ui: {
    selectedCharacterId: null,
    selectedTokenId: null,
    isDiceRollerOpen: false,
    diceFormula: null,
    includeSpecialAbilityInSkillRolls: false,
    diceRollIntent: null,
    isChatInputFocused: false,
    isVoiceRecording: false,
  },

  realtime: {
    optimisticBackupByCharacterId: {},
  },
};

// ============================================================================
// Store Creation
// ============================================================================

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...initialState,

  // Session actions
  setSession: (session) =>
    set((state) => ({
      session: { ...state.session, ...session },
    })),

  updateSessionSettings: (settings) =>
    set((state) => ({
      session: {
        ...state.session,
        settings: { ...state.session.settings, ...settings },
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
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({ ...character, ...updates });
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
   * Full CP2020 damage pipeline:
   * 1. Head hits: damage x2
   * 2. AP ammo: halve SP
   * 3. Subtract SP (and ablate SP by 1 if location specified)
   * 4. Subtract BTM
   * 5. Add remainder to damage total
   *
   * Point blank (FNFF): if pointBlank and weaponDamageFormula parse as NdS+M, base damage = max dice total.
   * Otherwise rawDamage is used (already your max if you typed it in manually).
   */
  applyDamage: (characterId, rawDamage, location, isAP = false, pointBlank = false, weaponDamageFormula = null) =>
    set((state) => {
      const character =
        state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      if (!character) return state;

      const isNpc = character.type === 'npc';

      let effectiveRaw = rawDamage;
      if (pointBlank && weaponDamageFormula) {
        const maxD = maxDamageFromDiceFormula(weaponDamageFormula);
        if (maxD !== null) {
          effectiveRaw = maxD;
        }
      }

      const sp = location ? Math.max(0, character.hitLocations[location].stoppingPower - character.hitLocations[location].ablation) : 0;
      const btm = character.derivedStats?.btm || 0;

      const result = calculateDamage(effectiveRaw, location, sp, btm, isAP);

      const newDamage = Math.min(41, Math.max(0, character.damage + result.finalDamage));

      // Apply ablation to hit location (increment ablation counter only;
      // stoppingPower is synced from armor on recalc, effective SP = stoppingPower - ablation)
      let updatedHitLocations = character.hitLocations;
      if (location && character.hitLocations[location] && effectiveRaw > 0) {
        const effectiveSP = Math.max(0, character.hitLocations[location].stoppingPower - character.hitLocations[location].ablation);
        if (effectiveSP > 0) {
          updatedHitLocations = {
            ...character.hitLocations,
            [location]: {
              ...character.hitLocations[location],
              ablation: character.hitLocations[location].ablation + 1,
            },
          };
        }
      }

      const updated = recalcCharacter({
        ...character,
        damage: newDamage,
        hitLocations: updatedHitLocations,
      });

      if (isNpc) {
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

  deductMoney: (characterId, amount) =>
    set((state) => {
      const character = state.characters.byId[characterId];
      if (!character) return state;

      return {
        characters: {
          ...state.characters,
          byId: {
            ...state.characters.byId,
            [characterId]: {
              ...character,
              eurobucks: Math.max(0, character.eurobucks - amount),
            },
          },
        },
      };
    }),

  addItem: (characterId, item) =>
    set((state) => {
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        items: [...character.items, item],
      });

      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  removeItem: (characterId, itemId) =>
    set((state) => {
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        items: character.items.filter((item) => item.id !== itemId),
      });

      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  sellItem: (characterId, itemId, sellFraction = 0.5) =>
    set((state) => {
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const item = character.items.find((i) => i.id === itemId);
      if (!item) return state;

      const payout = Math.max(0, Math.floor(item.cost * (sellFraction <= 0 || sellFraction > 1 ? 0.5 : sellFraction)));

      const updated = recalcCharacter({
        ...character,
        eurobucks: character.eurobucks + payout,
        items: character.items.filter((i) => i.id !== itemId),
      });

      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  updateCharacterField: (characterId, path, value) =>
    set((state) => {
      const character = state.characters.byId[characterId];
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
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        skills: [...character.skills, skill],
      });

      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  updateSkill: (characterId, skillId, updates) =>
    set((state) => {
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        skills: character.skills.map((s) => (s.id === skillId ? { ...s, ...updates } : s)),
      });

      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  removeSkill: (characterId, skillId) =>
    set((state) => {
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const updated = recalcCharacter({
        ...character,
        skills: character.skills.filter((s) => s.id !== skillId),
      });

      return {
        characters: {
          ...state.characters,
          byId: { ...state.characters.byId, [characterId]: updated },
        },
      };
    }),

  // Weapon actions
  fireWeapon: (characterId, weaponId, mode) => {
    const state = get();
    const character = state.characters.byId[characterId];
    if (!character) return false;

    const weaponIdx = character.items.findIndex((i) => i.id === weaponId && i.type === 'weapon');
    if (weaponIdx === -1) return false;

    const weapon = character.items[weaponIdx] as Weapon;
    const isMelee = weapon.weaponType === 'Melee';

    if (isMelee) return true;

    const ammoNeeded = getAmmoConsumed(mode, weapon.rof);
    if (weapon.shotsLeft < ammoNeeded) return false;

    const updatedItems = [...character.items];
    updatedItems[weaponIdx] = {
      ...weapon,
      shotsLeft: weapon.shotsLeft - ammoNeeded,
    } as unknown as Item;

    set((s) => ({
      characters: {
        ...s.characters,
        byId: {
          ...s.characters.byId,
          [characterId]: { ...character, items: updatedItems },
        },
      },
    }));

    return true;
  },

  reloadWeapon: (characterId, weaponId) =>
    set((state) => {
      const character = state.characters.byId[characterId];
      if (!character) return state;

      const updatedItems = character.items.map((item) => {
        if (item.id === weaponId && item.type === 'weapon') {
          const w = item as unknown as Weapon;
          return { ...w, shotsLeft: w.shots } as unknown as Item;
        }
        return item;
      });

      return {
        characters: {
          ...state.characters,
          byId: {
            ...state.characters.byId,
            [characterId]: { ...character, items: updatedItems },
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
    set((state) => ({
      chat: { ...state.chat, messages: [...state.chat.messages, message] },
    })),

  setChatLoading: (isLoading) =>
    set((state) => ({
      chat: { ...state.chat, isLoading },
    })),

  clearChatHistory: () =>
    set((state) => ({
      chat: { ...state.chat, messages: [] },
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

  closeDiceRoller: () =>
    set((state) => ({
      ui: {
        ...state.ui,
        isDiceRollerOpen: false,
        diceFormula: null,
        diceRollIntent: null,
      },
    })),

  beginStunSaveRoll: (characterId) =>
    set((state) => ({
      ui: {
        ...state.ui,
        isDiceRollerOpen: true,
        diceFormula: 'flat:1d10',
        diceRollIntent: { characterId, kind: 'stun' },
      },
    })),

  beginDeathSaveRoll: (characterId) => {
    const char = get().characters.byId[characterId];
    const target = char?.derivedStats?.deathSaveTarget ?? -1;
    if (target < 0) return;
    set((state) => ({
      ui: {
        ...state.ui,
        isDiceRollerOpen: true,
        diceFormula: 'flat:1d10',
        diceRollIntent: { characterId, kind: 'death' },
      },
    }));
  },

  clearDiceRollIntent: () =>
    set((state) => ({
      ui: { ...state.ui, diceRollIntent: null },
    })),

  applyStunSaveRollResult: (characterId, flatRollTotal) => {
    const char = get().characters.byId[characterId];
    if (!char?.derivedStats) return;
    const bonus = char.combatModifiers?.stunSave ?? 0;
    const target = char.derivedStats.stunSaveTarget + bonus;
    const success = isFlatSaveSuccess(flatRollTotal, target);
    get().updateCharacterField(characterId, 'isStunned', !success);
  },

  applyDeathSaveRollResult: (characterId, flatRollTotal) => {
    const char = get().characters.byId[characterId];
    if (!char?.derivedStats) return;
    const saveBonus = char.combatModifiers?.stunSave ?? 0;
    const target = char.derivedStats.deathSaveTarget + saveBonus;
    if (char.derivedStats.deathSaveTarget < 0) return;
    if (!isFlatSaveSuccess(flatRollTotal, target)) {
      get().updateCharacterField(characterId, 'damage', 41);
    }
  },

  setIncludeSpecialAbilityInSkillRolls: (include) =>
    set((state) => ({
      ui: { ...state.ui, includeSpecialAbilityInSkillRolls: include },
    })),

  setVoiceRecording: (isRecording) =>
    set((state) => ({
      ui: { ...state.ui, isVoiceRecording: isRecording },
    })),

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
        },
        characters: { byId: byIdChar, allIds: allIdsChar },
        npcs: { byId: byIdNpc, allIds: allIdsNpc },
        map: {
          backgroundImageUrl: snapshot.session.mapBackgroundUrl,
          tokens: snapshot.tokens,
        },
        chat: {
          messages: snapshot.chatMessages,
          isLoading: false,
        },
        ui: state.ui,
        realtime: { optimisticBackupByCharacterId: {} },
      };
    }),

  applyRemoteCharacterUpsert: (character) =>
    set((state) => {
      const rec = recalcCharacter(character);
      if (rec.type === 'npc') {
        const exists = state.npcs.allIds.includes(rec.id);
        return {
          npcs: {
            byId: { ...state.npcs.byId, [rec.id]: rec },
            allIds: exists ? state.npcs.allIds : [...state.npcs.allIds, rec.id],
          },
        };
      }
      const exists = state.characters.allIds.includes(rec.id);
      return {
        characters: {
          byId: { ...state.characters.byId, [rec.id]: rec },
          allIds: exists ? state.characters.allIds : [...state.characters.allIds, rec.id],
        },
      };
    }),

  removeRemoteCharacter: (characterId) =>
    set((state) => {
      if (characterId in state.characters.byId) {
        const byId = { ...state.characters.byId };
        delete byId[characterId];
        return {
          characters: {
            byId,
            allIds: state.characters.allIds.filter((id) => id !== characterId),
          },
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
      return {
        chat: { ...state.chat, messages: [...state.chat.messages, message] },
      };
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
  return state.characters.byId[characterId];
};

export const selectSelectedCharacter = (state: GameState & GameActions): Character | undefined => {
  if (!state.ui.selectedCharacterId) return undefined;
  return state.characters.byId[state.ui.selectedCharacterId];
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
  return state.characters.byId[characterId]?.derivedStats;
};

export const selectCanAfford = (
  state: GameState & GameActions,
  characterId: string,
  cost: number,
): boolean => {
  const character = state.characters.byId[characterId];
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
