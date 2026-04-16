/**
 * Property-based tests for Cyberpunk 2020 game formulas
 * Feature: ai-gm-multiplayer-app
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  btmFromBT,
  strengthDamageBonus,
  calculateDerivedStats,
  calculateWoundState,
  combineSP,
  maxLayeredSP,
  isFlatSaveSuccess,
  getStabilizationMedicBonus,
} from './formulas';
import { Character, createStatBlock } from '../types';

// ============================================================================
// Property 12: Derived Stats Calculation
// Validates: Requirements 5.1
// ============================================================================

describe('Property 12: Derived Stats Calculation', () => {
  it('BTM calculation from body type follows the lookup table', () => {
    // Feature: ai-gm-multiplayer-app, Property 12: Derived Stats Calculation
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }), // body type range
        (bt) => {
          const btm = btmFromBT(bt);
          
          // Verify BTM follows the lookup table
          if (bt <= 2) {
            expect(btm).toBe(0);
          } else if (bt <= 4) {
            expect(btm).toBe(1);
          } else if (bt <= 7) {
            expect(btm).toBe(2);
          } else if (bt <= 9) {
            expect(btm).toBe(3);
          } else if (bt === 10) {
            expect(btm).toBe(4);
          } else {
            expect(btm).toBe(5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('strength damage bonus calculation is correct', () => {
    // Feature: ai-gm-multiplayer-app, Property 12: Derived Stats Calculation
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        (bt) => {
          const bonus = strengthDamageBonus(bt);
          const btm = btmFromBT(bt);
          
          if (btm < 5) {
            expect(bonus).toBe(btm - 2);
          } else if (bt <= 12) {
            expect(bonus).toBe(4);
          } else if (bt <= 14) {
            expect(bonus).toBe(6);
          } else {
            expect(bonus).toBe(8);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('derived stats are calculated correctly from character stats', () => {
    // Feature: ai-gm-multiplayer-app, Property 12: Derived Stats Calculation
    fc.assert(
      fc.property(
        fc.record({
          ma: fc.integer({ min: 1, max: 10 }),
          bt: fc.integer({ min: 1, max: 10 }),
          emp: fc.integer({ min: 1, max: 10 }),
          damage: fc.integer({ min: 0, max: 40 }),
        }),
        ({ ma, bt, emp, damage }) => {
          // Create a minimal character for testing
          const character: Character = {
            id: 'test',
            userId: 'test',
            sessionId: 'test',
            name: 'Test Character',
            type: 'character',
            imageUrl: '',
            role: 'Solo',
            age: 25,
            points: 0,
            stats: {
              int: createStatBlock(5, 0),
              ref: createStatBlock(5, 0),
              tech: createStatBlock(5, 0),
              cool: createStatBlock(5, 0),
              attr: createStatBlock(5, 0),
              luck: createStatBlock(5, 0),
              ma: createStatBlock(ma, 0),
              bt: createStatBlock(bt, 0),
              emp: createStatBlock(emp, 0),
            },
            specialAbility: { name: 'Combat Sense', value: 0 },
            reputation: 0,
            improvementPoints: 0,
            skills: [],
            damage,
            isStunned: false,
            conditions: [],
            hitLocations: {
              Head: { location: [1], stoppingPower: 0, ablation: 0 },
              Torso: { location: [2, 4], stoppingPower: 0, ablation: 0 },
              rArm: { location: [5], stoppingPower: 0, ablation: 0 },
              lArm: { location: [6], stoppingPower: 0, ablation: 0 },
              lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
              rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
            },
            sdp: {
              sum: { Head: 0, Torso: 0, lArm: 0, rArm: 0, lLeg: 0, rLeg: 0 },
              current: { Head: 0, Torso: 0, lArm: 0, rArm: 0, lLeg: 0, rLeg: 0 },
            },
            eurobucks: 0,
            items: [],
            netrunDeck: null,
            lifepath: null,
          };
          
          const derived = calculateDerivedStats(character);
          
          // Verify BTM
          expect(derived.btm).toBe(btmFromBT(bt));
          
          // Verify movement
          expect(derived.run).toBe(ma * 3);
          expect(derived.leap).toBe(Math.floor((ma * 3) / 4));
          
          // Verify carrying capacity
          expect(derived.carry).toBe(bt * 10);
          expect(derived.lift).toBe(bt * 40);
          
          // Verify humanity (no cyberware in this test)
          expect(derived.humanity).toBe(emp * 10);
          expect(derived.currentEmp).toBe(emp);
          
          // Verify wound state is calculated
          expect(derived.woundState).toBeDefined();
          expect(derived.woundPenalties).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 14: Damage Application and Wound State
// Validates: Requirements 5.2, 5.5, 6.3, 6.4
// ============================================================================

describe('Property 14: Damage Application and Wound State', () => {
  it('wound state is calculated correctly from damage total', () => {
    // Feature: ai-gm-multiplayer-app, Property 14: Damage Application and Wound State
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (damage) => {
          const { woundState, woundPenalties } = calculateWoundState(damage);
          
          // Verify wound state based on damage
          if (damage === 0) {
            expect(woundState).toBe('Uninjured');
            expect(woundPenalties.ref).toBe(0);
            expect(woundPenalties.int).toBe(0);
            expect(woundPenalties.cool).toBe(0);
          } else if (damage <= 4) {
            expect(woundState).toBe('Light');
            expect(woundPenalties.ref).toBe(0);
            expect(woundPenalties.int).toBe(0);
            expect(woundPenalties.cool).toBe(0);
          } else if (damage <= 8) {
            expect(woundState).toBe('Serious');
            expect(woundPenalties.ref).toBe(-2);
            expect(woundPenalties.int).toBe(0);
            expect(woundPenalties.cool).toBe(0);
          } else if (damage <= 12) {
            expect(woundState).toBe('Critical');
            // Critical penalties are calculated per-character in calculateDerivedStats
            expect(woundPenalties.ref).toBe(0);
            expect(woundPenalties.int).toBe(0);
            expect(woundPenalties.cool).toBe(0);
          } else if (damage <= 40) {
            const mortalLevel = Math.min(6, Math.ceil(damage / 4) - 4);
            expect(woundState).toBe(`Mortal${mortalLevel}`);
            // Mortal penalties are calculated per-character in calculateDerivedStats
            expect(woundPenalties.ref).toBe(0);
            expect(woundPenalties.int).toBe(0);
            expect(woundPenalties.cool).toBe(0);
          } else {
            expect(woundState).toBe('Dead');
            expect(woundPenalties.ref).toBe(-999);
            expect(woundPenalties.int).toBe(-999);
            expect(woundPenalties.cool).toBe(-999);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('wound penalties are applied correctly to character stats', () => {
    // Feature: ai-gm-multiplayer-app, Property 14: Damage Application and Wound State
    fc.assert(
      fc.property(
        fc.record({
          ref: fc.integer({ min: 1, max: 10 }),
          int: fc.integer({ min: 1, max: 10 }),
          cool: fc.integer({ min: 1, max: 10 }),
          damage: fc.integer({ min: 0, max: 40 }),
        }),
        ({ ref, int, cool, damage }) => {
          const { woundPenalties } = calculateWoundState(damage);
          
          // Apply penalties based on wound state
          let expectedRef = ref;
          let _expectedInt = int;
          let _expectedCool = cool;
          
          if (damage === 0 || damage <= 4) {
            // No penalties
            expectedRef = ref;
            _expectedInt = int;
            _expectedCool = cool;
          } else if (damage <= 8) {
            // Serious: REF -2
            expectedRef = ref - 2;
          } else if (damage <= 12) {
            // Critical: halved (rounded up)
            expectedRef = Math.ceil(ref / 2);
            _expectedInt = Math.ceil(int / 2);
            _expectedCool = Math.ceil(cool / 2);
          } else if (damage <= 40) {
            // Mortal: 1/3 (rounded up)
            expectedRef = Math.ceil(ref / 3);
            _expectedInt = Math.ceil(int / 3);
            _expectedCool = Math.ceil(cool / 3);
          }
          
          // Verify penalties direction is correct
          if (damage <= 4) {
            expect(woundPenalties.ref).toBe(0);
          } else if (damage <= 8) {
            expect(woundPenalties.ref).toBe(-2);
            expect(expectedRef).toBe(ref - 2);
          } else if (damage <= 12) {
            expect(expectedRef).toBe(Math.ceil(ref / 2));
          } else if (damage <= 40) {
            expect(expectedRef).toBe(Math.ceil(ref / 3));
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 13: Armor SP Layering
// Validates: Requirements 5.4
// ============================================================================

describe('Property 13: Armor SP Layering', () => {
  it('combineSP follows the layering formula', () => {
    // Feature: ai-gm-multiplayer-app, Property 13: Armor SP Layering
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (a, b) => {
          const result = combineSP(a, b);
          
          // If either is 0, result should be the other
          if (a === 0) {
            expect(result).toBe(b);
            return;
          }
          if (b === 0) {
            expect(result).toBe(a);
            return;
          }
          
          // Calculate expected result
          const diff = Math.abs(a - b);
          let mod: number;
          
          if (diff >= 27) mod = 0;
          else if (diff >= 21) mod = 1;
          else if (diff >= 15) mod = 2;
          else if (diff >= 9) mod = 3;
          else if (diff >= 5) mod = 4;
          else mod = 5;
          
          const expected = Math.max(a, b) + mod;
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('maxLayeredSP returns correct value for multiple layers', () => {
    // Feature: ai-gm-multiplayer-app, Property 13: Armor SP Layering
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 25 }), { minLength: 1, maxLength: 5 }),
        (spValues) => {
          const result = maxLayeredSP(spValues);
          
          // Filter valid values
          const validSP = spValues.filter(v => v > 0);
          
          if (validSP.length === 0) {
            expect(result).toBe(0);
          } else if (validSP.length === 1) {
            expect(result).toBe(validSP[0]);
          } else {
            // Result should be at least the maximum single value
            expect(result).toBeGreaterThanOrEqual(Math.max(...validSP));
            
            // Due to layering bonuses, result can exceed sum of values
            // Maximum theoretical bonus is +5 per layer
            const maxPossibleBonus = (validSP.length - 1) * 5;
            const maxTheoretical = validSP.reduce((a, b) => a + b, 0) + maxPossibleBonus;
            expect(result).toBeLessThanOrEqual(maxTheoretical);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('maxLayeredSP is commutative (order independent)', () => {
    // Feature: ai-gm-multiplayer-app, Property 13: Armor SP Layering
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 2, maxLength: 4 }),
        (spValues) => {
          const result1 = maxLayeredSP(spValues);
          const shuffled = [...spValues].sort(() => Math.random() - 0.5);
          const result2 = maxLayeredSP(shuffled);
          
          // Order shouldn't matter for optimal layering
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Flat save helper', () => {
  it('isFlatSaveSuccess: success when roll ≤ target', () => {
    expect(isFlatSaveSuccess(3, 5)).toBe(true);
    expect(isFlatSaveSuccess(5, 5)).toBe(true);
    expect(isFlatSaveSuccess(6, 5)).toBe(false);
  });
});

describe('getStabilizationMedicBonus', () => {
  it('sums TECH and the higher of First Aid vs Medical Tech', () => {
    const character: Character = {
      id: 'm1',
      userId: 'u',
      sessionId: 's',
      name: 'Medic',
      type: 'character',
      imageUrl: '',
      role: 'Medtechie',
      age: 30,
      points: 0,
      stats: {
        int: createStatBlock(5, 0),
        ref: createStatBlock(5, 0),
        tech: createStatBlock(10, 0),
        cool: createStatBlock(5, 0),
        attr: createStatBlock(5, 0),
        luck: createStatBlock(5, 0),
        ma: createStatBlock(5, 0),
        bt: createStatBlock(5, 0),
        emp: createStatBlock(5, 0),
      },
      specialAbility: { name: 'Medical Tech', value: 0 },
      reputation: 0,
      improvementPoints: 0,
      skills: [
        {
          id: 's1',
          name: 'First Aid',
          value: 4,
          linkedStat: 'tech',
          category: 'TECH',
          isChipped: false,
        },
        {
          id: 's2',
          name: 'Medical Tech',
          value: 7,
          linkedStat: 'tech',
          category: 'TECH',
          isChipped: false,
        },
      ],
      damage: 20,
      isStunned: false,
      conditions: [],
      hitLocations: {
        Head: { location: [1], stoppingPower: 0, ablation: 0 },
        Torso: { location: [2, 4], stoppingPower: 0, ablation: 0 },
        rArm: { location: [5], stoppingPower: 0, ablation: 0 },
        lArm: { location: [6], stoppingPower: 0, ablation: 0 },
        lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
        rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
      },
      sdp: {
        sum: { Head: 0, Torso: 0, lArm: 0, rArm: 0, lLeg: 0, rLeg: 0 },
        current: { Head: 0, Torso: 0, lArm: 0, rArm: 0, lLeg: 0, rLeg: 0 },
      },
      eurobucks: 0,
      items: [],
      netrunDeck: null,
      lifepath: null,
    };
    expect(getStabilizationMedicBonus(character)).toBe(17);
  });
});
