/**
 * Decrement timed conditions each combat round; strip timed entries on end combat.
 */

import { recalcCharacterForGm } from '../gm/character-mutations';
import type { Character } from '../types';

export interface ConditionTickResult {
  character: Character;
  /** Conditions removed because duration reached 0. */
  expired: { name: string }[];
}

export function tickConditionsOneRound(character: Character): ConditionTickResult {
  const expired: { name: string }[] = [];
  const existing = character.conditions ?? [];
  const next = existing.flatMap((c) => {
    if (c.duration === null) return [c];
    const d = c.duration - 1;
    if (d <= 0) {
      expired.push({ name: c.name });
      return [];
    }
    return [{ ...c, duration: d }];
  });
  return {
    character: recalcCharacterForGm({ ...character, conditions: next }),
    expired,
  };
}

export function stripTimedConditions(character: Character): Character {
  const next = (character.conditions ?? []).filter((c) => c.duration === null);
  return recalcCharacterForGm({ ...character, conditions: next });
}
