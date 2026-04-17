import { describe, expect, it } from 'vitest';
import { normalizeCellRect, parseMapStateJson } from './map-state';

describe('map-state', () => {
  it('parseMapStateJson defaults empty', () => {
    expect(parseMapStateJson(null)).toEqual({ coverRegions: [] });
  });

  it('normalizeCellRect orders corners', () => {
    expect(normalizeCellRect(5, 2, 1, 8)).toEqual({ c0: 1, c1: 5, r0: 2, r1: 8 });
  });
});
