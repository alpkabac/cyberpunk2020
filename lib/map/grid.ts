/**
 * Tactical grid helpers: positions are stored as map percentages (0–100).
 * Grid divides the map into cols × rows cells; distance is Euclidean in cell units between cell indices.
 */

export const MAP_GRID_DEFAULT_COLS = 20;
export const MAP_GRID_DEFAULT_ROWS = 20;
export const MAP_GRID_MIN = 2;
export const MAP_GRID_MAX = 99;

export function normalizeGridDimension(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.max(MAP_GRID_MIN, Math.min(MAP_GRID_MAX, i));
}

export function pctToCell(xPct: number, yPct: number, cols: number, rows: number): { c: number; r: number } {
  const c = Math.min(cols - 1, Math.max(0, Math.floor((xPct / 100) * cols)));
  const r = Math.min(rows - 1, Math.max(0, Math.floor((yPct / 100) * rows)));
  return { c, r };
}

export function cellCenterPct(c: number, r: number, cols: number, rows: number): { x: number; y: number } {
  return {
    x: ((c + 0.5) / cols) * 100,
    y: ((r + 0.5) / rows) * 100,
  };
}

export function snapPctToGrid(xPct: number, yPct: number, cols: number, rows: number): { x: number; y: number } {
  const { c, r } = pctToCell(xPct, yPct, cols, rows);
  return cellCenterPct(c, r, cols, rows);
}

/** Euclidean distance in grid cells between the cells containing each percentage position. */
export function cellDistance(
  x1Pct: number,
  y1Pct: number,
  x2Pct: number,
  y2Pct: number,
  cols: number,
  rows: number,
): number {
  const a = pctToCell(x1Pct, y1Pct, cols, rows);
  const b = pctToCell(x2Pct, y2Pct, cols, rows);
  const dc = b.c - a.c;
  const dr = b.r - a.r;
  return Math.sqrt(dc * dc + dr * dr);
}
