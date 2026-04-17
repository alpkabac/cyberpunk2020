import { describe, it, expect } from 'vitest';
import type { Character } from '@/lib/types';
import { createStatBlock } from '@/lib/types';
import { resolveGmRequestRoll } from './resolve-gm-request-roll';

function minimalChar(overrides: Partial<Character> = {}): Character {
  const stats = {
    int: createStatBlock(5, 0),
    ref: createStatBlock(6, 0),
    tech: createStatBlock(4, 0),
    cool: createStatBlock(5, 0),
    attr: createStatBlock(5, 0),
    luck: createStatBlock(5, 0),
    ma: createStatBlock(5, 0),
    bt: createStatBlock(5, 0),
    emp: createStatBlock(5, 0),
  };
  return {
    id: 'c1',
    userId: 'u',
    sessionId: 's',
    name: 'Test',
    type: 'character',
    isNpc: false,
    team: '',
    imageUrl: '',
    role: 'Solo',
    age: 20,
    points: 0,
    stats,
    specialAbility: { name: 'Combat Sense', value: 2 },
    reputation: 0,
    improvementPoints: 0,
    skills: [
      {
        id: 'sk1',
        name: 'Handgun',
        value: 4,
        linkedStat: 'ref',
        category: 'REF',
        isChipped: false,
      },
    ],
    damage: 0,
    isStunned: false,
    isStabilized: false,
    conditions: [],
    hitLocations: {} as Character['hitLocations'],
    sdp: {
      sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    },
    eurobucks: 0,
    items: [],
    netrunDeck: null,
    lifepath: null,
    ...overrides,
  };
}

describe('resolveGmRequestRoll', () => {
  it('resolves skill from character (REF 6 + Handgun 4 = 1d10+10)', () => {
    const c = minimalChar();
    const r = resolveGmRequestRoll(
      c,
      { roll_kind: 'skill', skill_id: 'sk1', formula: '' },
      { includeSpecialAbilityInSkillRolls: false },
    );
    expect(r.resolvedFromCharacter).toBe(true);
    expect(r.formula).toBe('1d10+10');
  });

  it('adds special ability when enabled', () => {
    const c = minimalChar();
    const r = resolveGmRequestRoll(
      c,
      { roll_kind: 'skill', skill_id: 'sk1' },
      { includeSpecialAbilityInSkillRolls: true },
    );
    expect(r.formula).toBe('1d10+12');
  });

  it('resolves stat', () => {
    const c = minimalChar();
    const r = resolveGmRequestRoll(
      c,
      { roll_kind: 'stat', stat: 'ref' },
      { includeSpecialAbilityInSkillRolls: false },
    );
    expect(r.resolvedFromCharacter).toBe(true);
    expect(r.formula).toBe('1d10+6');
  });

  it('falls back to formula for raw_formula', () => {
    const c = minimalChar();
    const r = resolveGmRequestRoll(
      c,
      { roll_kind: 'raw_formula', formula: '2d6+1' },
      { includeSpecialAbilityInSkillRolls: false },
    );
    expect(r.resolvedFromCharacter).toBe(false);
    expect(r.formula).toBe('2d6+1');
  });
});
