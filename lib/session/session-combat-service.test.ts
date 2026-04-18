import { describe, expect, it } from 'vitest';
import type { Character, InitiativeEntry } from '../types';
import { allInitiativeEntriesIncapacitated } from './session-combat-service';

function entry(characterId: string): InitiativeEntry {
  return {
    characterId,
    name: 'X',
    ref: 5,
    initiativeMod: 0,
    combatSense: 0,
    cyberInitiativeBonus: 0,
    d10Total: 5,
    d10Detail: '5',
    total: 10,
  };
}

function char(id: string, damage: number): Character {
  return { id, damage } as Character;
}

describe('allInitiativeEntriesIncapacitated', () => {
  it('is false when no entries', () => {
    expect(allInitiativeEntriesIncapacitated([], new Map())).toBe(false);
  });

  it('is false when any combatant has damage below 41', () => {
    const entries = [entry('a'), entry('b')];
    const byId = new Map<string, Character>([
      ['a', char('a', 41)],
      ['b', char('b', 10)],
    ]);
    expect(allInitiativeEntriesIncapacitated(entries, byId)).toBe(false);
  });

  it('is true when every entry is dead or missing from the map', () => {
    const entries = [entry('a'), entry('b')];
    const byId = new Map<string, Character>([
      ['a', char('a', 41)],
      ['b', char('b', 50)],
    ]);
    expect(allInitiativeEntriesIncapacitated(entries, byId)).toBe(true);
  });

  it('treats missing sheets as out of the fight', () => {
    const entries = [entry('gone')];
    const byId = new Map<string, Character>();
    expect(allInitiativeEntriesIncapacitated(entries, byId)).toBe(true);
  });
});
