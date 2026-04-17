/**
 * Map grid fire line vs drawn cover: ordered regions, stacked SP, to-hit hints (CP2020 FNFF).
 */

import type { MapCoverRegion } from '../types';
import { stackOuterToInnerCoverSp } from '../game-logic/formulas';
import { coverTypeLabel, coverTypeSp } from './cover-types';
import { bresenhamLine, cellKey, expandCoverCells } from './tactical-cover-hint';

export function effectiveMapCoverRegionSp(region: MapCoverRegion): number {
  const base = coverTypeSp(region.coverTypeId);
  const ab = Math.max(0, Math.floor(region.spAblation ?? 0));
  return Math.max(0, base - ab);
}

function normalizeRect(reg: MapCoverRegion): { c0: number; c1: number; r0: number; r1: number } {
  return {
    c0: Math.min(reg.c0, reg.c1),
    c1: Math.max(reg.c0, reg.c1),
    r0: Math.min(reg.r0, reg.r1),
    r1: Math.max(reg.r0, reg.r1),
  };
}

/** First matching region when iterating in `regions` order (GM draw order wins on overlap). */
export function findCoverRegionForCell(
  regions: MapCoverRegion[],
  c: number,
  r: number,
): MapCoverRegion | null {
  for (const reg of regions) {
    const { c0, c1, r0, r1 } = normalizeRect(reg);
    if (c >= c0 && c <= c1 && r >= r0 && r <= r1) return reg;
  }
  return null;
}

/**
 * Cover regions the ray enters, in order from shooter toward target (each region at most once).
 * Includes cells stepped on from shooter-exclusive through target-inclusive (FNFF shoot-through / target in cover).
 */
export function orderedCoverRegionsOnFireLine(
  shooterC: number,
  shooterR: number,
  targetC: number,
  targetR: number,
  regions: MapCoverRegion[],
): MapCoverRegion[] {
  if (regions.length === 0) return [];
  const line = bresenhamLine(shooterC, shooterR, targetC, targetR);
  const seen = new Set<string>();
  const out: MapCoverRegion[] = [];
  for (let i = 1; i < line.length; i++) {
    const { c, r } = line[i];
    const reg = findCoverRegionForCell(regions, c, r);
    if (reg && !seen.has(reg.id)) {
      seen.add(reg.id);
      out.push(reg);
    }
  }
  return out;
}

export function computeStackedCoverSpFromRegions(ordered: MapCoverRegion[]): number {
  const sps = ordered.map((r) => effectiveMapCoverRegionSp(r));
  return stackOuterToInnerCoverSp(sps);
}

/** Labels matching `rangedCombatModifiers` in lookups.ts */
export type CoverToHitModLabel =
  | 'Target behind cover (1/4)'
  | 'Target behind cover (1/2)'
  | 'Target behind cover (3/4)';

export function suggestCoverToHitModifier(coverCellFraction: number): CoverToHitModLabel | null {
  if (coverCellFraction <= 0) return null;
  if (coverCellFraction < 0.25) return 'Target behind cover (1/4)';
  if (coverCellFraction < 0.5) return 'Target behind cover (1/2)';
  return 'Target behind cover (3/4)';
}

/**
 * Fraction of cells along the fire line (shooter exclusive → target inclusive) that lie on drawn cover.
 * Used to pick −2 / −3 / −4 to-hit modifiers.
 */
export function coverCellFractionAlongFireLine(
  shooterC: number,
  shooterR: number,
  targetC: number,
  targetR: number,
  regions: MapCoverRegion[],
): number {
  if (regions.length === 0) return 0;
  const line = bresenhamLine(shooterC, shooterR, targetC, targetR);
  if (line.length <= 1) return 0;
  const coverCells = expandCoverCells(regions);
  let onCover = 0;
  const total = line.length - 1;
  for (let i = 1; i < line.length; i++) {
    const { c, r } = line[i];
    if (coverCells.has(cellKey(c, r))) onCover++;
  }
  return total > 0 ? onCover / total : 0;
}

export interface MapFireCoverSummary {
  orderedRegions: MapCoverRegion[];
  stackedCoverSp: number;
  coverRegionIds: string[];
  coverCellFraction: number;
  suggestedToHitLabel: CoverToHitModLabel | null;
  /** Short labels for UI / chat */
  regionDescriptions: string[];
}

export function summarizeMapFireCover(
  shooterC: number,
  shooterR: number,
  targetC: number,
  targetR: number,
  regions: MapCoverRegion[],
): MapFireCoverSummary {
  const orderedRegions = orderedCoverRegionsOnFireLine(shooterC, shooterR, targetC, targetR, regions);
  const stackedCoverSp = computeStackedCoverSpFromRegions(orderedRegions);
  const coverRegionIds = orderedRegions.map((r) => r.id);
  const coverCellFraction = coverCellFractionAlongFireLine(shooterC, shooterR, targetC, targetR, regions);
  const suggestedToHitLabel = suggestCoverToHitModifier(coverCellFraction);
  const regionDescriptions = orderedRegions.map((r) => {
    const eff = effectiveMapCoverRegionSp(r);
    const ab = r.spAblation ?? 0;
    const lab = coverTypeLabel(r.coverTypeId);
    return ab > 0 ? `${lab} (eff SP ${eff}, −${ab} abl)` : `${lab} (eff SP ${eff})`;
  });
  return {
    orderedRegions,
    stackedCoverSp,
    coverRegionIds,
    coverCellFraction,
    suggestedToHitLabel,
    regionDescriptions,
  };
}
