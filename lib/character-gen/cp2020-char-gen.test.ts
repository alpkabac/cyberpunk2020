import { describe, expect, it } from 'vitest';
import {
  allocateStatsFromCharacterPoints,
  cinematicCharacterPoints,
  distributeCareerSkills,
  generateCp2020Character,
  monthlySalaryEb,
  NPC_THREAT_CINEMATIC_POINTS,
  resolveCharacterPoints,
  rollCharacterPointsRandom,
  ROLE_CAREER_PACKAGES,
} from './cp2020-char-gen';

/** Deterministic RNG: linear congruential */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('cp2020-char-gen', () => {
  it('random character points are sum of 9d10', () => {
    const rng = makeRng(42);
    const p = rollCharacterPointsRandom(rng);
    expect(p).toBeGreaterThanOrEqual(9);
    expect(p).toBeLessThanOrEqual(90);
  });

  it('allocated stats are 2–10 and sum to character points', () => {
    const rng = makeRng(7);
    const points = 52;
    const stats = allocateStatsFromCharacterPoints(points, rng);
    const keys = ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'] as const;
    let sum = 0;
    for (const k of keys) {
      expect(stats[k].base).toBeGreaterThanOrEqual(2);
      expect(stats[k].base).toBeLessThanOrEqual(10);
      sum += stats[k].base;
    }
    expect(sum).toBe(points);
  });

  it('career package has 10 skills and 40 points total', () => {
    const rng = makeRng(99);
    const { skills, specialValue } = distributeCareerSkills('Solo', rng);
    expect(skills).toHaveLength(10);
    const total = skills.reduce((a, s) => a + s.value, 0);
    expect(total).toBe(40);
    expect(specialValue).toBeGreaterThanOrEqual(1);
    expect(specialValue).toBeLessThanOrEqual(10);
    const sa = skills.find((s) => s.isSpecialAbility);
    expect(sa?.name).toBe('Combat Sense');
  });

  it('every role has a 10-entry career package', () => {
    for (const [role, names] of Object.entries(ROLE_CAREER_PACKAGES)) {
      expect(names, role).toHaveLength(10);
    }
  });

  it('cinematic presets are in playable range', () => {
    expect(cinematicCharacterPoints('average')).toBe(50);
    expect(cinematicCharacterPoints(40)).toBe(40);
  });

  it('resolveCharacterPoints uses cinematic table when requested', () => {
    const rng = makeRng(1);
    expect(resolveCharacterPoints('cinematic', rng, 'major_hero')).toBe(80);
  });

  it('generateCp2020Character produces a recalculated sheet', () => {
    const rng = makeRng(123);
    const c = generateCp2020Character({
      sessionId: '00000000-0000-4000-8000-000000000001',
      userId: 'u1',
      name: 'Test',
      role: 'Netrunner',
      method: 'fast',
      rng,
    });
    expect(c.sessionId).toBe('00000000-0000-4000-8000-000000000001');
    expect(c.userId).toBe('u1');
    expect(c.type).toBe('character');
    expect(c.isNpc).toBe(false);
    expect(c.points).toBeGreaterThanOrEqual(18);
    expect(c.skills.length).toBeGreaterThanOrEqual(10);
    expect(c.derivedStats).toBeDefined();
    expect(monthlySalaryEb('Solo', 6)).toBe(3000);
  });

  it('unclaimed slot uses empty userId', () => {
    const rng = makeRng(3);
    const c = generateCp2020Character({
      sessionId: '00000000-0000-4000-8000-000000000002',
      name: 'Open Slot',
      role: 'Fixer',
      method: 'random',
      rng,
    });
    expect(c.userId).toBe('');
  });

  it('kind npc produces NPC type and empty userId', () => {
    const rng = makeRng(11);
    const c = generateCp2020Character({
      sessionId: '00000000-0000-4000-8000-000000000003',
      name: 'Ganger',
      role: 'Solo',
      method: 'cinematic',
      cinematicPreset: NPC_THREAT_CINEMATIC_POINTS.mook,
      kind: 'npc',
      rng,
    });
    expect(c.type).toBe('npc');
    expect(c.isNpc).toBe(true);
    expect(c.userId).toBe('');
    expect(c.points).toBe(40);
  });
});
