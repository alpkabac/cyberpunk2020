/**
 * Dice rolling logic for Cyberpunk 2020
 * Implements exploding d10 and dice formula parsing
 */

import { RollResult } from '../types';

/**
 * Roll a single exploding d10
 * If the result is 10, roll again and add to the total
 * Continues until a non-10 is rolled
 */
export function rollExplodingD10(): number {
  let total = 0;
  let roll: number;
  
  do {
    roll = Math.floor(Math.random() * 10) + 1; // 1-10
    total += roll;
  } while (roll === 10);
  
  return total;
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
 * Returns the total and individual roll results
 */
export function rollDice(formula: string): RollResult | null {
  const parsed = parseDiceFormula(formula);
  
  if (!parsed) {
    return null;
  }
  
  const { count, sides, modifier, multiplier, exploding } = parsed;
  const rolls: number[] = [];
  
  // Roll the dice
  for (let i = 0; i < count; i++) {
    if (exploding && sides === 10) {
      rolls.push(rollExplodingD10());
    } else {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }
  }
  
  // Calculate total
  let total = rolls.reduce((sum, roll) => sum + roll, 0);
  total = (total * multiplier) + modifier;
  
  return {
    total,
    rolls,
    formula,
  };
}
