/**
 * Dice rolling logic for Cyberpunk 2020
 * Implements exploding d10 and dice formula parsing
 */

import { RollResult } from '../types';

/**
 * Roll a single exploding d10 (FNFF).
 * If the result is 10, roll again and add to the total until a non-10 is rolled.
 */
export function rollExplodingD10Detailed(): {
  total: number;
  faces: number[];
  /** True if at least one 10 was rolled (more than one face, or chain continued after 10). */
  exploded: boolean;
} {
  const faces: number[] = [];
  let total = 0;
  let roll: number;
  do {
    roll = Math.floor(Math.random() * 10) + 1; // 1-10
    faces.push(roll);
    total += roll;
  } while (roll === 10);
  return { total, faces, exploded: faces.length > 1 };
}

/** Same as rollExplodingD10Detailed().total — kept for tests and callers that only need the sum. */
export function rollExplodingD10(): number {
  return rollExplodingD10Detailed().total;
}

/**
 * Parse a dice formula string
 * Supported formats:
 * - XdY: Roll X dice with Y sides
 * - XdY+Z: Roll X dice with Y sides and add Z
 * - XdY-Z: Roll X dice with Y sides and subtract Z
 * - 1d10x10: Roll 1d10 and multiply by 10 (special case)
 * 
 * Returns null if the formula is invalid
 */
export function parseDiceFormula(formula: string): {
  count: number;
  sides: number;
  modifier: number;
  multiplier: number;
  exploding: boolean;
} | null {
  // Remove whitespace
  const cleaned = formula.trim().toLowerCase();
  
  // Check for multiplier format (e.g., "1d10x10")
  const multMatch = cleaned.match(/^(\d+)d(\d+)x(\d+)$/);
  if (multMatch) {
    return {
      count: parseInt(multMatch[1], 10),
      sides: parseInt(multMatch[2], 10),
      modifier: 0,
      multiplier: parseInt(multMatch[3], 10),
      exploding: parseInt(multMatch[2], 10) === 10,
    };
  }
  
  // Check for standard format with optional modifier (e.g., "2d6+3" or "1d10-2")
  const stdMatch = cleaned.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (stdMatch) {
    const count = parseInt(stdMatch[1], 10);
    const sides = parseInt(stdMatch[2], 10);
    const modifier = stdMatch[3] ? parseInt(stdMatch[3], 10) : 0;
    
    return {
      count,
      sides,
      modifier,
      multiplier: 1,
      exploding: sides === 10,
    };
  }
  
  return null;
}

/**
 * Roll dice according to a formula
 * Prefix with `flat:` for non-exploding d10 (stun/death saves: roll ≤ target on one die).
 * Example: `flat:1d10` — single d10, no explosion on 10.
 */
export function rollDice(formula: string): RollResult | null {
  let f = formula.trim();
  let flat = false;
  if (f.toLowerCase().startsWith('flat:')) {
    flat = true;
    f = f.slice(5).trim();
  }

  const parsed = parseDiceFormula(f);

  if (!parsed) {
    return null;
  }

  const { count, sides, modifier, multiplier, exploding } = parsed;
  const rolls: number[] = [];
  const explodingD10Chains: number[][] = [];
  let hadExplodingD10 = false;
  let firstD10Face: number | undefined;

  // Roll the dice (d10 explodes for attacks unless `flat:` — saves must not explode)
  for (let i = 0; i < count; i++) {
    if (!flat && exploding && sides === 10) {
      const d = rollExplodingD10Detailed();
      rolls.push(d.total);
      explodingD10Chains.push(d.faces);
      if (d.exploded) hadExplodingD10 = true;
      if (i === 0) firstD10Face = d.faces[0];
    } else {
      const r = Math.floor(Math.random() * sides) + 1;
      rolls.push(r);
      if (i === 0 && sides === 10) firstD10Face = r;
    }
  }

  // Calculate total
  let total = rolls.reduce((sum, roll) => sum + roll, 0);
  total = total * multiplier + modifier;

  return {
    total,
    rolls,
    formula,
    hadExplodingD10,
    ...(hadExplodingD10 && explodingD10Chains.length > 0
      ? { explodingD10Chains }
      : {}),
    ...(firstD10Face !== undefined ? { firstD10Face } : {}),
  };
}

/**
 * Maximum possible total for a simple NdS+M weapon damage string (CP2020 point-blank max damage).
 * Examples: "3d6" -> 18, "4d6+1" -> 25, "2d6+3" -> 15
 */
export function maxDamageFromDiceFormula(formula: string): number | null {
  const cleaned = formula.replace(/\s/g, '').toLowerCase();
  const m = cleaned.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  return count * sides + mod;
}
