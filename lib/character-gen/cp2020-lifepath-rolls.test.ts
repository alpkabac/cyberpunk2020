import { describe, expect, it } from 'vitest';
import {
  rollContactPersonaSketch,
  rollLifepathAgeFromBook,
  rollLifepathLifeEventsFromBook,
  rollLifepathStyleFromBook,
} from './cp2020-lifepath-rolls';

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('cp2020-lifepath-rolls', () => {
  it('style uses three d10 picks from book tables', () => {
    const rng = makeRng(99);
    const st = rollLifepathStyleFromBook(rng);
    expect(st.clothes.length).toBeGreaterThan(0);
    expect(st.hair.length).toBeGreaterThan(0);
    expect(st.affectations.length).toBeGreaterThan(0);
  });

  it('life events has one row per year from 17 through age', () => {
    const rng = makeRng(1);
    expect(rollLifepathLifeEventsFromBook(16, rng)).toHaveLength(0);
    expect(rollLifepathLifeEventsFromBook(17, rng)).toHaveLength(1);
    expect(rollLifepathLifeEventsFromBook(20, makeRng(2))).toHaveLength(4);
  });

  it('book age is 18–28 (2D6+16)', () => {
    for (let i = 0; i < 50; i++) {
      const a = rollLifepathAgeFromBook(makeRng(i * 997 + 3));
      expect(a).toBeGreaterThanOrEqual(18);
      expect(a).toBeLessThanOrEqual(28);
    }
  });

  it('contact persona sketch rolls style + motivations (book p.38)', () => {
    const s = rollContactPersonaSketch(makeRng(42));
    expect(s).toContain('They present as:');
    expect(s).toContain('Personality:');
    expect(s).not.toContain('Ref: roll');
  });
});
