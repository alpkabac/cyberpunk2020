import { describe, expect, it } from 'vitest';
import {
  reconcileSuppressiveZonesForCombat,
  suppressiveSaveNumber,
  suppressiveZoneWidthMeters,
} from './suppressive-fire';
import type { CombatState, MapSuppressiveZone } from '../types';

function zone(partial: Partial<MapSuppressiveZone> & Pick<MapSuppressiveZone, 'id' | 'ownerCharacterId'>): MapSuppressiveZone {
  return {
    c0: 0,
    r0: 0,
    c1: 1,
    r1: 0,
    placedRound: 1,
    placedActiveTurnIndex: 0,
    suppressExpiryUntilTurnChange: true,
    roundsCommitted: 10,
    widthMeters: 5,
    saveNumber: 2,
    weaponDamage: '2d6',
    weaponAp: false,
    ...partial,
  };
}

describe('suppressive-fire', () => {
  it('suppressiveSaveNumber rounds up and respects min width', () => {
    expect(suppressiveSaveNumber(10, 5)).toBe(2);
    expect(suppressiveSaveNumber(7, 2)).toBe(4);
    expect(suppressiveSaveNumber(0, 5)).toBe(0);
  });

  it('suppressiveZoneWidthMeters uses longest grid edge × m/cell, min 2m', () => {
    expect(
      suppressiveZoneWidthMeters({
        c0: 0,
        r0: 0,
        c1: 2,
        r1: 0,
        metersPerSquare: 2,
      }),
    ).toBe(6);
    expect(
      suppressiveZoneWidthMeters({
        c0: 0,
        r0: 0,
        c1: 0,
        r1: 0,
        metersPerSquare: 1,
      }),
    ).toBe(2);
  });

  it('reconcileSuppressiveZonesForCombat keeps zones when no combat entries', () => {
    const z = [zone({ id: 'z1', ownerCharacterId: 'a' })];
    expect(reconcileSuppressiveZonesForCombat(z, null)).toEqual(z);
    expect(reconcileSuppressiveZonesForCombat(z, { round: 1, activeTurnIndex: 0, entries: [] } as CombatState)).toEqual(z);
  });

  it('reconcile clears guard then drops zone when turn returns to owner', () => {
    const combat: CombatState = {
      round: 1,
      activeTurnIndex: 1,
      entries: [
        { characterId: 'a', name: 'A', ref: 0, initiativeMod: 0, combatSense: 0, cyberInitiativeBonus: 0, d10Total: 0, d10Detail: '0', total: 0 },
        { characterId: 'b', name: 'B', ref: 0, initiativeMod: 0, combatSense: 0, cyberInitiativeBonus: 0, d10Total: 0, d10Detail: '0', total: 0 },
      ],
    };
    const zones = [
      zone({
        id: 'z1',
        ownerCharacterId: 'a',
        placedRound: 1,
        placedActiveTurnIndex: 0,
        suppressExpiryUntilTurnChange: true,
      }),
    ];
    const afterMove = reconcileSuppressiveZonesForCombat(zones, combat);
    expect(afterMove).toHaveLength(1);
    expect(afterMove[0].suppressExpiryUntilTurnChange).toBe(false);

    const backToOwner: CombatState = { ...combat, activeTurnIndex: 0 };
    const cleared = reconcileSuppressiveZonesForCombat(afterMove, backToOwner);
    expect(cleared).toHaveLength(0);
  });
});
