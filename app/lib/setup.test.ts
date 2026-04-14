import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Project Setup', () => {
  it('should have fast-check working', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        expect(n + 0).toBe(n);
      })
    );
  });

  it('should have basic TypeScript types available', () => {
    const stat: { base: number; tempMod: number } = {
      base: 5,
      tempMod: 2,
    };
    
    expect(stat.base).toBe(5);
    expect(stat.tempMod).toBe(2);
  });
});
