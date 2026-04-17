/**
 * CP2020 suppressive fire: save DC = rounds ÷ zone width (meters), min width 2m.
 */

import type { CombatState, MapSuppressiveZone } from '../types';

/** FNFF: save target = rounds placed ÷ width of zone in meters (round up). */
export function suppressiveSaveNumber(roundsCommitted: number, widthMeters: number): number {
  const w = Math.max(2, Number(widthMeters) || 2);
  const r = Math.max(0, Math.floor(roundsCommitted));
  if (r <= 0) return 0;
  return Math.ceil(r / w);
}

/**
 * Zone width in meters from grid rectangle: max(edge cells) × meters per cell.
 * Enforces minimum 2m (book).
 */
export function suppressiveZoneWidthMeters(args: {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
  metersPerSquare: number;
}): number {
  const mps = Math.max(0, Number(args.metersPerSquare) || 0);
  const dc = Math.abs(Math.round(args.c1) - Math.round(args.c0)) + 1;
  const dr = Math.abs(Math.round(args.r1) - Math.round(args.r0)) + 1;
  const edgeM = Math.max(dc, dr) * mps;
  return Math.max(2, edgeM > 0 ? edgeM : 2);
}

/**
 * When combat ends or is invalid, drop all suppressive zones.
 * Otherwise: clear "placement guard" once initiative moves off (round,index) where placed.
 * Then remove zones when initiative returns to the owner's slot (one full lap).
 */
export function reconcileSuppressiveZonesForCombat(
  zones: MapSuppressiveZone[],
  combat: CombatState | null | undefined,
): MapSuppressiveZone[] {
  if (zones.length === 0) return zones;
  /** No initiative tracker yet — keep zones (manual clear / map preset only). */
  if (!combat?.entries.length) return zones;

  const afterGuard = zones.map((z) => {
    if (!z.suppressExpiryUntilTurnChange) return z;
    const movedOff =
      combat.round !== z.placedRound || combat.activeTurnIndex !== z.placedActiveTurnIndex;
    if (movedOff) return { ...z, suppressExpiryUntilTurnChange: false };
    return z;
  });

  return afterGuard.filter((z) => {
    if (z.suppressExpiryUntilTurnChange) return true;
    const idx = combat.entries.findIndex((e) => e.characterId === z.ownerCharacterId);
    if (idx < 0) return false;
    return combat.activeTurnIndex !== idx;
  });
}
