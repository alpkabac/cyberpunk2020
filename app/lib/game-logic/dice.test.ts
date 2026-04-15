/**
 * Property-based tests for dice rolling logic
 * Feature: ai-gm-multiplayer-app
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  rollExplodingD10,
  rollExplodingD10Detailed,
  parseDiceFormula,
  rollDice,
  maxDamageFromDiceFormula,
} from './dice';

// ============================================================================
// Property 25: Exploding D10
// Validates: Requirements 12.2
// ============================================================================

describe('Property 25: Exploding D10', () => {
  it('exploding d10 always returns at least 1', () => {
    // Feature: ai-gm-multiplayer-app, Property 25: Exploding D10
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed, just run multiple times
        () => {
          const result = rollExplodingD10();
          expect(result).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('exploding d10 result is always positive', () => {
    // Feature: ai-gm-multiplayer-app, Property 25: Exploding D10
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const result = rollExplodingD10();
          expect(result).toBeGreaterThan(0);
          expect(Number.isInteger(result)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rollExplodingD10Detailed: exploded iff more than one face', () => {
    let sawExplosion = false;
    for (let i = 0; i < 400; i++) {
      const d = rollExplodingD10Detailed();
      expect(d.exploded).toBe(d.faces.length > 1);
      if (d.faces.length > 1) sawExplosion = true;
    }
    expect(sawExplosion).toBe(true);
  });

  it('exploding d10 can produce values greater than 10', () => {
    // Feature: ai-gm-multiplayer-app, Property 25: Exploding D10
    // Run many times to increase chance of getting a 10 (which triggers explosion)
    const results: number[] = [];
    for (let i = 0; i < 1000; i++) {
      results.push(rollExplodingD10());
    }
    
    // At least some results should be > 10 (exploded)
    const hasExplosion = results.some(r => r > 10);
    expect(hasExplosion).toBe(true);
  });
});


// ============================================================================
// Property 26: Dice Formula Parsing
// Validates: Requirements 12.3
// ============================================================================

describe('Property 26: Dice Formula Parsing', () => {
  it('parseDiceFormula correctly parses XdY format', () => {
    // Feature: ai-gm-multiplayer-app, Property 26: Dice Formula Parsing
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 2, max: 20 }),
        (count, sides) => {
          const formula = `${count}d${sides}`;
          const parsed = parseDiceFormula(formula);
          
          expect(parsed).not.toBeNull();
          expect(parsed!.count).toBe(count);
          expect(parsed!.sides).toBe(sides);
          expect(parsed!.modifier).toBe(0);
          expect(parsed!.multiplier).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('parseDiceFormula correctly parses XdY+Z format', () => {
    // Feature: ai-gm-multiplayer-app, Property 26: Dice Formula Parsing
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (count, sides, modifier) => {
          const formula = `${count}d${sides}+${modifier}`;
          const parsed = parseDiceFormula(formula);
          
          expect(parsed).not.toBeNull();
          expect(parsed!.count).toBe(count);
          expect(parsed!.sides).toBe(sides);
          expect(parsed!.modifier).toBe(modifier);
          expect(parsed!.multiplier).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('parseDiceFormula correctly parses XdY-Z format', () => {
    // Feature: ai-gm-multiplayer-app, Property 26: Dice Formula Parsing
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (count, sides, modifier) => {
          const formula = `${count}d${sides}-${modifier}`;
          const parsed = parseDiceFormula(formula);
          
          expect(parsed).not.toBeNull();
          expect(parsed!.count).toBe(count);
          expect(parsed!.sides).toBe(sides);
          expect(parsed!.modifier).toBe(-modifier);
          expect(parsed!.multiplier).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('parseDiceFormula correctly parses 1d10x10 format', () => {
    // Feature: ai-gm-multiplayer-app, Property 26: Dice Formula Parsing
    const parsed = parseDiceFormula('1d10x10');
    
    expect(parsed).not.toBeNull();
    expect(parsed!.count).toBe(1);
    expect(parsed!.sides).toBe(10);
    expect(parsed!.modifier).toBe(0);
    expect(parsed!.multiplier).toBe(10);
    expect(parsed!.exploding).toBe(true);
  });

  it('rollDice returns valid results for valid formulas', () => {
    // Feature: ai-gm-multiplayer-app, Property 26: Dice Formula Parsing
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 2, max: 12 }),
        (count, sides) => {
          const formula = `${count}d${sides}`;
          const result = rollDice(formula);
          
          expect(result).not.toBeNull();
          expect(result!.rolls).toHaveLength(count);
          expect(result!.formula).toBe(formula);
          expect(typeof result!.hadExplodingD10).toBe('boolean');
          expect(result!.total).toBeGreaterThanOrEqual(count); // Minimum possible
          
          // Each roll should be valid
          result!.rolls.forEach(roll => {
            expect(roll).toBeGreaterThanOrEqual(1);
            if (sides !== 10) {
              // Non-exploding dice
              expect(roll).toBeLessThanOrEqual(sides);
            }
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rollDice returns null for invalid formulas', () => {
    // Feature: ai-gm-multiplayer-app, Property 26: Dice Formula Parsing
    const invalidFormulas = ['invalid', '2d', 'd6', '2x6', 'abc', ''];
    
    invalidFormulas.forEach(formula => {
      const result = rollDice(formula);
      expect(result).toBeNull();
    });
  });

  it('flat:1d10 never exceeds 10 on the die (no explosion)', () => {
    for (let i = 0; i < 200; i++) {
      const result = rollDice('flat:1d10');
      expect(result).not.toBeNull();
      expect(result!.rolls).toHaveLength(1);
      expect(result!.hadExplodingD10).toBe(false);
      expect(result!.firstD10Face).toBe(result!.rolls[0]);
      expect(result!.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(result!.rolls[0]).toBeLessThanOrEqual(10);
      expect(result!.total).toBe(result!.rolls[0]);
    }
  });

  it('2d6 has no firstD10Face', () => {
    const r = rollDice('2d6');
    expect(r).not.toBeNull();
    expect(r!.firstD10Face).toBeUndefined();
  });

  it('1d10 firstD10Face is the first die face (1–10)', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollDice('1d10');
      expect(r!.firstD10Face).toBeGreaterThanOrEqual(1);
      expect(r!.firstD10Face).toBeLessThanOrEqual(10);
    }
  });

  it('non-flat 1d10 sets hadExplodingD10 when explosion occurred', () => {
    let sawTrue = false;
    let sawFalse = false;
    for (let i = 0; i < 500; i++) {
      const result = rollDice('1d10');
      expect(result).not.toBeNull();
      if (result!.hadExplodingD10) {
        sawTrue = true;
        expect(result!.explodingD10Chains).toBeDefined();
        expect(result!.explodingD10Chains!.some((c) => c.length > 1)).toBe(true);
      } else {
        sawFalse = true;
        expect(result!.rolls[0]).toBeLessThanOrEqual(10);
      }
    }
    expect(sawTrue).toBe(true);
    expect(sawFalse).toBe(true);
  });

  it('maxDamageFromDiceFormula parses CP2020 weapon codes', () => {
    expect(maxDamageFromDiceFormula('3d6')).toBe(18);
    expect(maxDamageFromDiceFormula('4d6+1')).toBe(25);
    expect(maxDamageFromDiceFormula('2d6+3')).toBe(15);
    expect(maxDamageFromDiceFormula('1d10')).toBe(10);
    expect(maxDamageFromDiceFormula('not dice')).toBeNull();
  });
});
