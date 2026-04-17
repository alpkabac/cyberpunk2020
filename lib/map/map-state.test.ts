import { describe, expect, it } from 'vitest';
import { normalizeCellRect, parseMapStateJson } from './map-state';

describe('map-state', () => {
  it('parseMapStateJson defaults empty', () => {
    expect(parseMapStateJson(null)).toEqual({
      coverRegions: [],
      suppressiveZones: [],
      pendingSuppressivePlacements: [],
    });
  });

  it('normalizeCellRect orders corners', () => {
    expect(normalizeCellRect(5, 2, 1, 8)).toEqual({ c0: 1, c1: 5, r0: 2, r1: 8 });
  });

  it('parseMapStateJson migrates legacy single pendingSuppressivePlacement to queue', () => {
    const parsed = parseMapStateJson({
      coverRegions: [],
      pendingSuppressivePlacement: {
        characterId: 'c1',
        weaponId: 'w1',
        roundsCommitted: 5,
        weaponDamage: '3d6',
        weaponAp: false,
        weaponName: 'SMG',
      },
    });
    expect(parsed.pendingSuppressivePlacements).toHaveLength(1);
    expect(parsed.pendingSuppressivePlacements[0].characterId).toBe('c1');
    expect(parsed.pendingSuppressivePlacements[0].roundsCommitted).toBe(5);
  });

  it('parseMapStateJson preserves spAblation', () => {
    const parsed = parseMapStateJson({
      coverRegions: [
        {
          id: 'r1',
          c0: 0,
          c1: 0,
          r0: 0,
          r1: 0,
          coverTypeId: 'wood_door',
          spAblation: 2,
        },
      ],
    });
    expect(parsed.coverRegions).toHaveLength(1);
    expect(parsed.coverRegions[0].spAblation).toBe(2);
  });
});
