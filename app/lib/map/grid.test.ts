import { describe, expect, it } from 'vitest';
import { cellCenterPct, cellDistance, pctToCell, snapPctToGrid } from './grid';

describe('grid', () => {
  it('pctToCell maps quadrants', () => {
    expect(pctToCell(0, 0, 10, 10)).toEqual({ c: 0, r: 0 });
    expect(pctToCell(99.9, 99.9, 10, 10)).toEqual({ c: 9, r: 9 });
  });

  it('snapPctToGrid lands on cell centers', () => {
    const { x, y } = snapPctToGrid(50, 50, 20, 12);
    const { c, r } = pctToCell(x, y, 20, 12);
    const center = cellCenterPct(c, r, 20, 12);
    expect(x).toBeCloseTo(center.x, 5);
    expect(y).toBeCloseTo(center.y, 5);
  });

  it('cellDistance is zero for same cell', () => {
    expect(cellDistance(10, 10, 12, 11, 20, 12)).toBe(0);
  });

  it('cellDistance is Euclidean in cell units', () => {
    expect(cellDistance(0, 0, 100, 100, 10, 10)).toBeCloseTo(Math.sqrt(9 * 9 + 9 * 9), 5);
  });
});
