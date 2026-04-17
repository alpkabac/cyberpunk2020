import { describe, expect, it } from 'vitest';
import { type Character, type CombatState, type InitiativeEntry, createStatBlock } from '../types';
import {
  combatStateToJson,
  parseCombatStateJson,
  sortInitiativeEntries,
  sumEquippedCyberwareInitiativeBonus,
} from './combat-state';
import { tickConditionsOneRound, stripTimedConditions } from './combat-condition-tick';

function testChar(id: string, name: string): Character {
  return {
    id,
    userId: 'u',
    sessionId: 's',
    name,
    type: 'character',
    isNpc: false,
    team: '',
    imageUrl: '',
    role: 'Solo',
    age: 25,
    points: 60,
    stats: {
      int: createStatBlock(6, 0),
      ref: createStatBlock(8, 0),
      tech: createStatBlock(5, 0),
      cool: createStatBlock(6, 0),
      attr: createStatBlock(6, 0),
      luck: createStatBlock(5, 0),
      ma: createStatBlock(6, 0),
      bt: createStatBlock(8, 0),
      emp: createStatBlock(6, 0),
    },
    specialAbility: { name: 'Combat Sense', value: 2 },
    reputation: 0,
    improvementPoints: 0,
    skills: [],
    damage: 0,
    isStunned: false,
    isStabilized: false,
    conditions: [
      { name: 'blinded', duration: 2 },
      { name: 'note', duration: null },
    ],
    hitLocations: {
      Head: { location: [1], stoppingPower: 0, ablation: 0 },
      Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
      rArm: { location: [5], stoppingPower: 0, ablation: 0 },
      lArm: { location: [6], stoppingPower: 0, ablation: 0 },
      lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
      rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
    },
    sdp: {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks: 0,
    items: [],
    netrunDeck: null,
    lifepath: null,
  };
}

describe('combat-state JSON', () => {
  it('round-trips parse ↔ serialize', () => {
    const entries: InitiativeEntry[] = [
      {
        characterId: 'a',
        name: 'Amy',
        ref: 8,
        initiativeMod: 0,
        combatSense: 2,
        cyberInitiativeBonus: 0,
        d10Total: 5,
        d10Detail: '5',
        total: 15,
      },
    ];
    const state = { round: 2, activeTurnIndex: 0, entries };
    const json = combatStateToJson(state);
    const back = parseCombatStateJson(json);
    expect(back).toEqual(state);
  });

  it('rejects invalid payloads', () => {
    expect(parseCombatStateJson({})).toBeNull();
    expect(parseCombatStateJson({ round: 0, activeTurnIndex: 0, entries: [] })).toBeNull();
  });

  it('round-trips startOfTurnSavesPendingFor when set', () => {
    const entries: InitiativeEntry[] = [
      {
        characterId: 'pc1',
        name: 'Player',
        ref: 8,
        initiativeMod: 0,
        combatSense: 0,
        cyberInitiativeBonus: 0,
        d10Total: 5,
        d10Detail: '5',
        total: 13,
      },
    ];
    const state: CombatState = {
      round: 1,
      activeTurnIndex: 0,
      entries,
      startOfTurnSavesPendingFor: 'pc1',
    };
    const json = combatStateToJson(state);
    const back = parseCombatStateJson(json);
    expect(back).toEqual(state);
  });
});

describe('sumEquippedCyberwareInitiativeBonus', () => {
  it('counts catalog initiative when sheet row has no initiativeBonus (legacy)', () => {
    const c = testChar('c1', 'C');
    c.items = [
      {
        id: 'k1',
        name: 'Kerenzikov Boosterware II',
        type: 'cyberware',
        flavor: '',
        notes: '',
        cost: 0,
        weight: 0,
        equipped: true,
        source: 'test',
        surgCode: 'N',
        humanityCost: '1d6',
        humanityLoss: 0,
        cyberwareType: 'NEURALWARE',
      },
    ];
    expect(sumEquippedCyberwareInitiativeBonus(c)).toBe(2);
  });
});

describe('sortInitiativeEntries', () => {
  it('orders by total desc then name', () => {
    const a: InitiativeEntry = {
      characterId: '1',
      name: 'Zed',
      ref: 5,
      initiativeMod: 0,
      combatSense: 0,
      cyberInitiativeBonus: 0,
      d10Total: 5,
      d10Detail: '5',
      total: 10,
    };
    const b: InitiativeEntry = {
      characterId: '2',
      name: 'Amy',
      ref: 5,
      initiativeMod: 0,
      combatSense: 0,
      cyberInitiativeBonus: 0,
      d10Total: 6,
      d10Detail: '6',
      total: 11,
    };
    const c: InitiativeEntry = {
      characterId: '3',
      name: 'Bob',
      ref: 5,
      initiativeMod: 0,
      combatSense: 0,
      cyberInitiativeBonus: 0,
      d10Total: 5,
      d10Detail: '5',
      total: 10,
    };
    const sorted = sortInitiativeEntries([a, b, c]);
    expect(sorted.map((e) => e.name)).toEqual(['Amy', 'Bob', 'Zed']);
  });
});

describe('combat-condition-tick', () => {
  it('ticks finite durations and preserves null duration', () => {
    const c = testChar('c1', 'C');
    const t1 = tickConditionsOneRound(c);
    expect(t1.expired).toEqual([]);
    expect(t1.character.conditions?.find((x) => x.name === 'blinded')?.duration).toBe(1);
    expect(t1.character.conditions?.find((x) => x.name === 'note')?.duration).toBeNull();

    const t2 = tickConditionsOneRound(t1.character);
    expect(t2.expired).toEqual([{ name: 'blinded' }]);
    expect(t2.character.conditions?.some((x) => x.name === 'blinded')).toBe(false);
  });

  it('stripTimedConditions removes only finite durations', () => {
    const c = testChar('c1', 'C');
    const next = stripTimedConditions(c);
    expect(next.conditions?.map((x) => x.name)).toEqual(['note']);
  });
});
