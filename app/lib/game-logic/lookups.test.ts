/**
 * Property-based tests for game lookups
 * Feature: ai-gm-multiplayer-app
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getHitLocation,
  hitLocationTable,
  rollFnffHitLocation,
  resolveMartialArtsStyleKey,
  getMartialActionBonus,
  formatKnowLanguageSkill,
  parseKnowLanguageLabel,
  isKnowLanguageSkill,
  masterSkillList,
  martialArtsStyleSkillDefinitions,
} from './lookups';

// ============================================================================
// Property 17: Hit Location Mapping
// Validates: Requirements 6.5
// ============================================================================

describe('Property 17: Hit Location Mapping', () => {
  it('getHitLocation maps d10 results correctly', () => {
    // Feature: ai-gm-multiplayer-app, Property 17: Hit Location Mapping
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (roll) => {
        const location = getHitLocation(roll);

        expect(location).not.toBeNull();

        // Verify against the lookup table
        if (roll === 1) {
          expect(location).toBe('Head');
        } else if (roll >= 2 && roll <= 4) {
          expect(location).toBe('Torso');
        } else if (roll === 5) {
          expect(location).toBe('rArm');
        } else if (roll === 6) {
          expect(location).toBe('lArm');
        } else if (roll === 7 || roll === 8) {
          expect(location).toBe('rLeg');
        } else if (roll === 9 || roll === 10) {
          expect(location).toBe('lLeg');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('getHitLocation returns null for invalid rolls', () => {
    // Feature: ai-gm-multiplayer-app, Property 17: Hit Location Mapping
    fc.assert(
      fc.property(fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 11 })), (invalidRoll) => {
        const location = getHitLocation(invalidRoll);
        expect(location).toBeNull();
      }),
      { numRuns: 50 },
    );
  });

  it('hit location table covers all d10 results', () => {
    // Feature: ai-gm-multiplayer-app, Property 17: Hit Location Mapping
    for (let i = 1; i <= 10; i++) {
      expect(hitLocationTable[i]).toBeDefined();
      expect(typeof hitLocationTable[i]).toBe('string');
    }
  });

  it('all hit locations are valid zones', () => {
    // Feature: ai-gm-multiplayer-app, Property 17: Hit Location Mapping
    const validZones = ['Head', 'Torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];

    for (let i = 1; i <= 10; i++) {
      const location = hitLocationTable[i];
      expect(validZones).toContain(location);
    }
  });

  it('rollFnffHitLocation returns consistent d10 and zone', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), () => {
        const { d10, zone } = rollFnffHitLocation();
        expect(d10).toBeGreaterThanOrEqual(1);
        expect(d10).toBeLessThanOrEqual(10);
        expect(zone).toBe(getHitLocation(d10));
      }),
      { numRuns: 30 },
    );
  });
});

describe('Martial arts style keys (multiplayer / import aliases)', () => {
  it('resolves book-style display names to canonical bonuses', () => {
    expect(resolveMartialArtsStyleKey('Martial Arts: Choi Li Fut')).toBe('Martial Arts: ChoiLiFut');
    expect(resolveMartialArtsStyleKey('Martial Arts: Thai Kick Boxing')).toBe(
      'Martial Arts: ThaiKickBoxing',
    );
  });

  it('returns null for legacy untyped Martial Arts', () => {
    expect(resolveMartialArtsStyleKey('Martial Arts')).toBeNull();
  });

  it('getMartialActionBonus uses resolved style', () => {
    expect(getMartialActionBonus('Martial Arts: Karate', 'Kick')).toBe(2);
    expect(getMartialActionBonus('Martial Arts: Choi Li Fut', 'Strike')).toBe(2);
  });
});

describe('Know Language skill naming', () => {
  it('formats and parses prefixed names', () => {
    expect(formatKnowLanguageSkill('Japanese')).toBe('Know Language: Japanese');
    expect(parseKnowLanguageLabel('Know Language: Japanese')).toBe('Japanese');
    expect(isKnowLanguageSkill('Know Language: Spanish')).toBe(true);
    expect(isKnowLanguageSkill('Awareness/Notice')).toBe(false);
  });

  it('throws on empty language', () => {
    expect(() => formatKnowLanguageSkill('   ')).toThrow();
  });
});

describe('Master skill list shape', () => {
  it('includes all martial style entries and no generic Martial Arts / Know Language rows', () => {
    const names = masterSkillList.map((s) => s.name);
    expect(names).not.toContain('Martial Arts');
    expect(names).not.toContain('Know Language');
    expect(names).toContain('Martial Arts: Karate');
    for (const def of martialArtsStyleSkillDefinitions) {
      expect(names).toContain(def.name);
    }
  });
});
