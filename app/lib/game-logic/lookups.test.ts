/**
 * Property-based tests for game lookups
 * Feature: ai-gm-multiplayer-app
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getHitLocation, hitLocationTable } from './lookups';

// ============================================================================
// Property 17: Hit Location Mapping
// Validates: Requirements 6.5
// ============================================================================

describe('Property 17: Hit Location Mapping', () => {
  it('getHitLocation maps d10 results correctly', () => {
    // Feature: ai-gm-multiplayer-app, Property 17: Hit Location Mapping
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (roll) => {
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
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getHitLocation returns null for invalid rolls', () => {
    // Feature: ai-gm-multiplayer-app, Property 17: Hit Location Mapping
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.integer({ min: 11 })
        ),
        (invalidRoll) => {
          const location = getHitLocation(invalidRoll);
          expect(location).toBeNull();
        }
      ),
      { numRuns: 50 }
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
});
