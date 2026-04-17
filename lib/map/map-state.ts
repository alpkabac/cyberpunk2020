import type { MapCoverRegion, MapSuppressiveZone, PendingSuppressivePlacement } from '../types';
import { isValidCoverTypeId } from './cover-types';

export interface SessionMapState {
  coverRegions: MapCoverRegion[];
  suppressiveZones: MapSuppressiveZone[];
  /**
   * FIFO: each entry is committed ammo waiting for a rectangle on the map (shooter or session host draws).
   * Legacy DB rows may still have `pendingSuppressivePlacement` (single object); parser migrates to a one-element array.
   */
  pendingSuppressivePlacements: PendingSuppressivePlacement[];
}

const EMPTY: SessionMapState = { coverRegions: [], suppressiveZones: [], pendingSuppressivePlacements: [] };

function parseOnePendingSuppressive(raw: unknown): PendingSuppressivePlacement | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const characterId =
    typeof r.characterId === 'string' && r.characterId.trim() ? r.characterId.trim() : '';
  const weaponId = typeof r.weaponId === 'string' && r.weaponId.trim() ? r.weaponId.trim() : '';
  if (!characterId || !weaponId) return null;
  const roundsCommitted = Number(r.roundsCommitted);
  if (!Number.isFinite(roundsCommitted)) return null;
  const weaponDamage = typeof r.weaponDamage === 'string' ? r.weaponDamage : '';
  const weaponAp = r.weaponAp === true;
  const weaponNameRaw = typeof r.weaponName === 'string' ? r.weaponName.trim() : '';
  return {
    characterId,
    weaponId,
    roundsCommitted: Math.max(0, Math.floor(roundsCommitted)),
    weaponDamage: weaponDamage || '2d6',
    weaponAp,
    weaponName: weaponNameRaw || 'Weapon',
  };
}

function parsePendingSuppressivePlacements(o: Record<string, unknown>): PendingSuppressivePlacement[] {
  const arr = o.pendingSuppressivePlacements;
  if (Array.isArray(arr)) {
    const out: PendingSuppressivePlacement[] = [];
    for (const item of arr) {
      const p = parseOnePendingSuppressive(item);
      if (p) out.push(p);
    }
    return out;
  }
  const legacy = parseOnePendingSuppressive(o.pendingSuppressivePlacement);
  return legacy ? [legacy] : [];
}

function parseSuppressiveZones(raw: unknown): MapSuppressiveZone[] {
  if (!Array.isArray(raw)) return [];
  const out: MapSuppressiveZone[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : '';
    const ownerCharacterId =
      typeof r.ownerCharacterId === 'string' && r.ownerCharacterId.trim()
        ? r.ownerCharacterId.trim()
        : '';
    if (!id || !ownerCharacterId) continue;
    const c0 = Number(r.c0);
    const c1 = Number(r.c1);
    const r0 = Number(r.r0);
    const r1 = Number(r.r1);
    if (![c0, c1, r0, r1].every((n) => Number.isFinite(n))) continue;
    const placedRound = Number(r.placedRound);
    const placedActiveTurnIndex = Number(r.placedActiveTurnIndex);
    if (!Number.isFinite(placedRound) || !Number.isFinite(placedActiveTurnIndex)) continue;
    const suppressExpiryUntilTurnChange = r.suppressExpiryUntilTurnChange === true;
    const roundsCommitted = Number(r.roundsCommitted);
    const widthMeters = Number(r.widthMeters);
    const saveNumber = Number(r.saveNumber);
    if (!Number.isFinite(roundsCommitted) || !Number.isFinite(widthMeters) || !Number.isFinite(saveNumber)) {
      continue;
    }
    const weaponDamage = typeof r.weaponDamage === 'string' ? r.weaponDamage : '';
    const weaponAp = r.weaponAp === true;
    const weaponName = typeof r.weaponName === 'string' ? r.weaponName : undefined;
    out.push({
      id,
      c0: Math.round(c0),
      c1: Math.round(c1),
      r0: Math.round(r0),
      r1: Math.round(r1),
      ownerCharacterId,
      placedRound: Math.floor(placedRound),
      placedActiveTurnIndex: Math.floor(placedActiveTurnIndex),
      suppressExpiryUntilTurnChange,
      roundsCommitted: Math.max(0, Math.floor(roundsCommitted)),
      widthMeters: Math.max(2, widthMeters),
      saveNumber: Math.max(0, Math.floor(saveNumber)),
      weaponDamage: weaponDamage || '2d6',
      weaponAp,
      ...(weaponName ? { weaponName } : {}),
    });
  }
  return out;
}

export function parseMapStateJson(v: unknown): SessionMapState {
  if (!v || typeof v !== 'object') return { ...EMPTY };
  const o = v as Record<string, unknown>;
  const rawCover = o.coverRegions;
  if (!Array.isArray(rawCover)) {
    const zonesOnly = parseSuppressiveZones(o.suppressiveZones);
    return {
      coverRegions: [],
      suppressiveZones: zonesOnly,
      pendingSuppressivePlacements: parsePendingSuppressivePlacements(o),
    };
  }

  const coverRegions: MapCoverRegion[] = [];
  for (const item of rawCover) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : '';
    const coverTypeId = typeof r.coverTypeId === 'string' ? r.coverTypeId : '';
    const c0 = Number(r.c0);
    const c1 = Number(r.c1);
    const r0 = Number(r.r0);
    const r1 = Number(r.r1);
    if (!id || !isValidCoverTypeId(coverTypeId)) continue;
    if (![c0, c1, r0, r1].every((n) => Number.isFinite(n))) continue;
    const abRaw = r.spAblation;
    const spAblation =
      abRaw !== undefined && Number.isFinite(Number(abRaw)) ? Math.max(0, Math.round(Number(abRaw))) : undefined;
    coverRegions.push({
      id,
      c0: Math.round(c0),
      c1: Math.round(c1),
      r0: Math.round(r0),
      r1: Math.round(r1),
      coverTypeId,
      ...(spAblation !== undefined && spAblation > 0 ? { spAblation } : {}),
    });
  }
  return {
    coverRegions,
    suppressiveZones: parseSuppressiveZones(o.suppressiveZones),
    pendingSuppressivePlacements: parsePendingSuppressivePlacements(o),
  };
}

export function normalizeCellRect(
  c0: number,
  r0: number,
  c1: number,
  r1: number,
): { c0: number; r0: number; c1: number; r1: number } {
  return {
    c0: Math.min(c0, c1),
    c1: Math.max(c0, c1),
    r0: Math.min(r0, r1),
    r1: Math.max(r0, r1),
  };
}
