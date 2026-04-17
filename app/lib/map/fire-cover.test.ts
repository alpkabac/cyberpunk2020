import { describe, expect, it } from 'vitest';
import type { MapCoverRegion } from '../types';
import {
  computeStackedCoverSpFromRegions,
  orderedCoverRegionsOnFireLine,
  suggestCoverToHitModifier,
} from './fire-cover';

describe('fire-cover', () => {
  const sheet: MapCoverRegion = {
    id: 'a',
    c0: 2,
    c1: 2,
    r0: 0,
    r1: 0,
    coverTypeId: 'sheetrock_wall',
  };

  it('orders regions along Bresenham line (shooter toward target)', () => {
    const brick: MapCoverRegion = {
      id: 'b',
      c0: 1,
      c1: 1,
      r0: 0,
      r1: 0,
      coverTypeId: 'brick_wall',
    };
    const ordered = orderedCoverRegionsOnFireLine(0, 0, 3, 0, [brick, sheet]);
    expect(ordered.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('stacks multiple cover SP inner-first along ordered regions', () => {
    const inner: MapCoverRegion = {
      id: 'i',
      c0: 1,
      c1: 1,
      r0: 0,
      r1: 0,
      coverTypeId: 'brick_wall',
    };
    const outer: MapCoverRegion = {
      id: 'o',
      c0: 0,
      c1: 0,
      r0: 0,
      r1: 0,
      coverTypeId: 'sheetrock_wall',
    };
    // Inner brick 25 + outer sheetrock 5 → larger 25, diff 20 → +2 → 27.
    expect(computeStackedCoverSpFromRegions([outer, inner])).toBe(27);
  });

  it('suggestCoverToHitModifier maps fraction to FNFF labels', () => {
    expect(suggestCoverToHitModifier(0)).toBe(null);
    expect(suggestCoverToHitModifier(0.1)).toBe('Target behind cover (1/4)');
    expect(suggestCoverToHitModifier(0.3)).toBe('Target behind cover (1/2)');
    expect(suggestCoverToHitModifier(0.8)).toBe('Target behind cover (3/4)');
  });
});
