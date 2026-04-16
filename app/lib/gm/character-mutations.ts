/**
 * Pure character updates for server-side GM tools (mirrors client store logic where needed).
 */

import type { Character, Item, ItemType, Zone } from '../types';
import {
  applyStatModifiers,
  calculateDamage,
  calculateDerivedStats,
  syncArmorToHitLocations,
} from '../game-logic/formulas';
import { maxDamageFromDiceFormula } from '../game-logic/dice';

export function recalcCharacterForGm(character: Character): Character {
  const updated = { ...character };
  syncArmorToHitLocations(updated);
  updated.derivedStats = calculateDerivedStats(updated);
  applyStatModifiers(updated);
  return updated;
}

export function applyGmDamage(
  character: Character,
  rawDamage: number,
  location: Zone | null,
  isAP = false,
  pointBlank = false,
  weaponDamageFormula: string | null = null,
): Character {
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

  const newDamage = Math.min(41, Math.max(0, character.damage + result.finalDamage));

  let updatedHitLocations = character.hitLocations;
  if (location && character.hitLocations[location] && effectiveRaw > 0) {
    const effectiveSP = Math.max(
      0,
      character.hitLocations[location].stoppingPower - character.hitLocations[location].ablation,
    );
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

  return recalcCharacterForGm({
    ...character,
    damage: newDamage,
    hitLocations: updatedHitLocations,
  });
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
