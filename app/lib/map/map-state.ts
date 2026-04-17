import type { MapCoverRegion } from '../types';
import { isValidCoverTypeId } from './cover-types';

export interface SessionMapState {
  coverRegions: MapCoverRegion[];
}

const EMPTY: SessionMapState = { coverRegions: [] };

export function parseMapStateJson(v: unknown): SessionMapState {
  if (!v || typeof v !== 'object') return { ...EMPTY };
  const o = v as Record<string, unknown>;
  const raw = o.coverRegions;
  if (!Array.isArray(raw)) return { ...EMPTY };

  const coverRegions: MapCoverRegion[] = [];
  for (const item of raw) {
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
  return { coverRegions };
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
