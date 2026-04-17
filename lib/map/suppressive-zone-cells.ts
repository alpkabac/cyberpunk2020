import type { MapSuppressiveZone } from '../types';

export function cellInsideSuppressiveZone(c: number, r: number, z: MapSuppressiveZone): boolean {
  const c0 = Math.min(z.c0, z.c1);
  const c1 = Math.max(z.c0, z.c1);
  const r0 = Math.min(z.r0, z.r1);
  const r1 = Math.max(z.r0, z.r1);
  return c >= c0 && c <= c1 && r >= r0 && r <= r1;
}
