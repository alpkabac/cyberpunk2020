/**
 * Pure character updates for server-side GM tools (mirrors client store logic where needed).
 */

import type { Character, CharacterCondition, Item, ItemType, Weapon, Zone } from '../types';
import {
  applyStatModifiers,
  calculateDamage,
  calculateDerivedStats,
  syncArmorToHitLocations,
} from '../game-logic/formulas';
import { maxDamageFromDiceFormula } from '../game-logic/dice';
import { severedConditionName } from '../game-logic/conditions';

export function recalcCharacterForGm(character: Character): Character {
  const updated = { ...character };
  syncArmorToHitLocations(updated);
  updated.derivedStats = calculateDerivedStats(updated);
  applyStatModifiers(updated);
  return updated;
}

/** Extra info surfaced by the FNFF damage pipeline (for GM tool results / UI banners). */
export interface GmDamageInfo {
  finalDamage: number;
  headMultiplied: boolean;
  penetrated: boolean;
  btmClampedToOne: boolean;
  limbSevered: boolean;
  headAutoKill: boolean;
  /** Stun save required per FNFF (character took damage and is still alive). */
  stunSaveRequired: boolean;
}

/** Convenience wrapper that returns just the mutated character (used by tests / legacy callers). */
export function applyGmDamage(
  character: Character,
  rawDamage: number,
  location: Zone | null,
  isAP = false,
  pointBlank = false,
  weaponDamageFormula: string | null = null,
): Character {
  return applyGmDamageDetailed(character, rawDamage, location, isAP, pointBlank, weaponDamageFormula).character;
}

/**
 * Full FNFF damage pipeline with result metadata.
 * See formulas.ts `calculateDamage` for book citations on each step.
 */
export function applyGmDamageDetailed(
  character: Character,
  rawDamage: number,
  location: Zone | null,
  isAP = false,
  pointBlank = false,
  weaponDamageFormula: string | null = null,
): { character: Character; info: GmDamageInfo } {
  let effectiveRaw = rawDamage;
  if (pointBlank && weaponDamageFormula) {
    const maxD = maxDamageFromDiceFormula(weaponDamageFormula);
    if (maxD !== null) {
      effectiveRaw = maxD;
    }
  }

  const sp =
    location && character.hitLocations[location]
      ? Math.max(
          0,
          character.hitLocations[location].stoppingPower - character.hitLocations[location].ablation,
        )
      : 0;
  const btm = character.derivedStats?.btm ?? 0;

  const result = calculateDamage(effectiveRaw, location, sp, btm, isAP);

  // Severance / head auto-kill escalation (FNFF L6424).
  let forcedDamageTotal: number | null = null;
  if (result.headAutoKill) {
    forcedDamageTotal = 41;
  } else if (result.limbSevered) {
    forcedDamageTotal = Math.max(character.damage + result.finalDamage, 13);
  }

  const newDamage =
    forcedDamageTotal !== null
      ? Math.min(41, Math.max(0, forcedDamageTotal))
      : Math.min(41, Math.max(0, character.damage + result.finalDamage));

  // Ablation only on a penetrating hit (FNFF L6350).
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

  // Persistent severance: mirrors the client store so the GM pipeline tags the
  // character with e.g. `severed_right_arm` for the Body tab / chat context.
  let updatedConditions: CharacterCondition[] = character.conditions ?? [];
  if (result.limbSevered && location) {
    const sevName = severedConditionName(location);
    if (sevName && !updatedConditions.some((c) => c.name === sevName)) {
      updatedConditions = [...updatedConditions, { name: sevName, duration: null }];
    }
  }

  const tookDamage = newDamage > character.damage;

  const updated = recalcCharacterForGm({
    ...character,
    damage: newDamage,
    hitLocations: updatedHitLocations,
    conditions: updatedConditions,
    ...(tookDamage ? { isStabilized: false } : {}),
  });
  const stillAlive = newDamage < 41;
  const stunSaveRequired = tookDamage && stillAlive;

  return {
    character: updated,
    info: {
      finalDamage: result.finalDamage,
      headMultiplied: result.headMultiplied,
      penetrated: result.penetrated,
      btmClampedToOne: result.btmClampedToOne,
      limbSevered: result.limbSevered,
      headAutoKill: result.headAutoKill,
      stunSaveRequired,
    },
  };
}

export function applyGmDeductMoney(character: Character, amount: number): Character {
  const n = Math.max(0, Math.floor(amount));
  return recalcCharacterForGm({
    ...character,
    eurobucks: Math.max(0, character.eurobucks - n),
  });
}

const ITEM_TYPES: ItemType[] = ['weapon', 'armor', 'cyberware', 'vehicle', 'misc', 'program'];

function isItemType(t: string): t is ItemType {
  return (ITEM_TYPES as string[]).includes(t);
}

export function normalizeIncomingItem(raw: Record<string, unknown>, id: string): Item | null {
  const name = typeof raw.name === 'string' ? raw.name : 'Item';
  const typeStr = typeof raw.type === 'string' ? raw.type : 'misc';
  if (!isItemType(typeStr)) return null;

  return {
    id,
    name,
    type: typeStr,
    flavor: typeof raw.flavor === 'string' ? raw.flavor : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    cost: typeof raw.cost === 'number' ? raw.cost : 0,
    weight: typeof raw.weight === 'number' ? raw.weight : 0,
    equipped: Boolean(raw.equipped),
    source: typeof raw.source === 'string' ? raw.source : 'gm',
  };
}

export function applyGmAddItem(character: Character, item: Item): Character {
  return recalcCharacterForGm({
    ...character,
    items: [...character.items, item],
  });
}

export function applyGmRemoveItem(character: Character, itemId: string): Character {
  return recalcCharacterForGm({
    ...character,
    items: character.items.filter((i) => i.id !== itemId),
  });
}

export function applyGmAddMoney(character: Character, amount: number): Character {
  const n = Math.max(0, Math.floor(amount));
  return recalcCharacterForGm({
    ...character,
    eurobucks: character.eurobucks + n,
  });
}

export function applyGmHealDamage(character: Character, amount: number): Character {
  const n = Math.max(0, Math.floor(amount));
  return recalcCharacterForGm({
    ...character,
    damage: Math.max(0, character.damage - n),
  });
}

/** Delta IP (can be negative for corrections); total clamps at 0. */
export function applyGmAdjustImprovementPoints(character: Character, delta: number): Character {
  const d = Math.trunc(delta);
  return recalcCharacterForGm({
    ...character,
    improvementPoints: Math.max(0, character.improvementPoints + d),
  });
}

export function applyGmEquipItem(
  character: Character,
  itemId: string,
  equipped: boolean,
): Character | null {
  const idx = character.items.findIndex((i) => i.id === itemId);
  if (idx === -1) return null;

  const updatedItems = [...character.items];
  updatedItems[idx] = { ...updatedItems[idx], equipped };

  return recalcCharacterForGm({ ...character, items: updatedItems });
}

export function applyGmModifySkill(
  character: Character,
  skillName: string,
  newValue: number,
): Character | null {
  const lower = skillName.toLowerCase();
  const idx = character.skills.findIndex((s) => s.name.toLowerCase() === lower);
  if (idx === -1) return null;

  const updatedSkills = [...character.skills];
  updatedSkills[idx] = { ...updatedSkills[idx], value: Math.max(0, Math.min(10, Math.floor(newValue))) };

  return recalcCharacterForGm({ ...character, skills: updatedSkills });
}

export function applyGmUpdateAmmo(
  character: Character,
  weaponId: string,
  shotsLeft: number | null,
  reload: boolean,
): Character | null {
  const idx = character.items.findIndex((i) => i.id === weaponId && i.type === 'weapon');
  if (idx === -1) return null;

  const weapon = character.items[idx] as unknown as Weapon;
  const newShots = reload ? weapon.shots : Math.max(0, Math.min(weapon.shots, Math.floor(shotsLeft ?? weapon.shotsLeft)));

  const updatedItems = [...character.items];
  updatedItems[idx] = { ...weapon, shotsLeft: newShots } as unknown as Item;

  return recalcCharacterForGm({ ...character, items: updatedItems });
}

/**
 * Apply or remove a persistent condition. "stunned" is rejected here — callers
 * must handle it via isStunned directly. "asleep" also sets isStunned (sleep =
 * unconscious in CP2020). All other conditions go into the conditions[] array.
 */
export function applyGmSetCondition(
  character: Character,
  condition: string,
  active: boolean,
  durationRounds: number | null = null,
): Character {
  const lower = condition.toLowerCase().trim();

  const alsoSetsStunned = lower === 'asleep' || lower === 'unconscious';

  const existing: CharacterCondition[] = character.conditions ?? [];
  let nextConditions: CharacterCondition[];

  if (active) {
    const entry: CharacterCondition = { name: lower, duration: durationRounds };
    const idx = existing.findIndex((c) => c.name === lower);
    if (idx !== -1) {
      nextConditions = [...existing];
      nextConditions[idx] = entry;
    } else {
      nextConditions = [...existing, entry];
    }
  } else {
    nextConditions = existing.filter((c) => c.name !== lower);
  }

  return recalcCharacterForGm({
    ...character,
    conditions: nextConditions,
    ...(alsoSetsStunned ? { isStunned: active } : {}),
  });
}

/**
 * Dot-path update (same semantics as client `updateCharacterField`).
 */
export function applyGmFieldUpdate(character: Character, path: string, value: unknown): Character {
  const pathParts = path.split('.').filter(Boolean);
  if (pathParts.length === 0) return character;

  const updatedCharacter = { ...character } as Record<string, unknown>;
  let current: Record<string, unknown> = updatedCharacter;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const next = current[part];
    const nested =
      next && typeof next === 'object' && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    current[part] = nested;
    current = nested;
  }

  const last = pathParts[pathParts.length - 1];
  current[last] = value;

  return recalcCharacterForGm(updatedCharacter as unknown as Character);
}
