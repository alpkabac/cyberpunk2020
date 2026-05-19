import { describe, expect, it } from 'vitest';
import {
  allocateStatsFromCharacterPoints,
  buildCp2020CharacterFromChargen,
  cinematicCharacterPoints,
  distributeCareerSkills,
  distributePickupSkills,
  generateCp2020Character,
  monthlySalaryEb,
  NPC_THREAT_CINEMATIC_POINTS,
  resolveCharacterPoints,
  rollCharacterPointsRandom,
  rollStartingEurobucks,
  ROLE_CAREER_PACKAGES,
  validateCp2020Chargen,
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

  it('Medtechie Diagnose Illness is INT-linked like the book skill list', () => {
    const rng = makeRng(101);
    const { skills } = distributeCareerSkills('Medtechie', rng);
    expect(skills.find((s) => s.name === 'Diagnose Illness')?.linkedStat).toBe('int');
  });

  it('cinematic presets are in playable range', () => {
    expect(cinematicCharacterPoints('average')).toBe(50);
    expect(cinematicCharacterPoints(40)).toBe(40);
  });

  it('resolveCharacterPoints uses cinematic table when requested', () => {
    const rng = makeRng(1);
    expect(resolveCharacterPoints('cinematic', rng, 'major_hero')).toBe(80);
  });

  it('starting eurobucks = floor(salary × d6/3), halved when second d6 > 4', () => {
    let n = 0;
    const rng = () => {
      n++;
      if (n === 1) return 0.999;
      if (n === 2) return 0;
      return 0;
    };
    expect(monthlySalaryEb('Solo', 6)).toBe(3000);
    expect(rollStartingEurobucks('Solo', 6, rng)).toBe(6000);

    let m = 0;
    const rngHalf = () => {
      m++;
      if (m === 1) return 0.999;
      if (m === 2) return 0.85;
      return 0;
    };
    expect(rollStartingEurobucks('Solo', 6, rngHalf)).toBe(3000);

    let k = 0;
    const rngLow = () => {
      k++;
      if (k === 1) return 0.01;
      if (k === 2) return 0;
      return 0;
    };
    expect(rollStartingEurobucks('Solo', 6, rngLow)).toBe(1000);
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

  it('generated sheets use the canonical FNFF hit location ranges', () => {
    const rng = makeRng(321);
    const c = generateCp2020Character({
      sessionId: '00000000-0000-4000-8000-000000000004',
      userId: 'u1',
      name: 'Leg Check',
      role: 'Solo',
      method: 'cinematic',
      rng,
    });
    expect(c.hitLocations.rLeg.location).toEqual([7, 8]);
    expect(c.hitLocations.lLeg.location).toEqual([9, 10]);
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

  it('validateCp2020Chargen catches bad career total', () => {
    const rng = makeRng(5);
    const { skills } = distributeCareerSkills('Cop', rng);
    const careerValues = Object.fromEntries(skills.map((s) => [s.name, s.value])) as Record<string, number>;
    careerValues[skills[0]!.name] = (careerValues[skills[0]!.name] ?? 0) + 1;
    const statBases = {
      int: 5,
      ref: 5,
      tech: 5,
      cool: 5,
      attr: 5,
      luck: 5,
      ma: 5,
      bt: 5,
      emp: 5,
    };
    const errs = validateCp2020Chargen({
      sessionId: '00000000-0000-4000-8000-000000000099',
      userId: 'u',
      name: 'x',
      role: 'Cop',
      age: 24,
      points: 45,
      statBases,
      careerValuesByName: careerValues,
      pickup: [],
      eurobucks: 1000,
    });
    expect(errs.some((e) => e.includes('40'))).toBe(true);
  });

  it('allows book pickup skills beyond the old curated shortlist', () => {
    const rng = makeRng(51);
    const { skills } = distributeCareerSkills('Solo', rng);
    const careerValues = Object.fromEntries(skills.map((s) => [s.name, s.value])) as Record<string, number>;
    const statBases = {
      int: 7,
      ref: 8,
      tech: 5,
      cool: 5,
      attr: 5,
      luck: 5,
      ma: 5,
      bt: 5,
      emp: 5,
    };
    const errs = validateCp2020Chargen({
      sessionId: '00000000-0000-4000-8000-000000000097',
      userId: 'u',
      name: 'x',
      role: 'Solo',
      age: 24,
      points: 50,
      statBases,
      careerValuesByName: careerValues,
      pickup: [{ name: 'Shadow/Track', value: 3 }],
      eurobucks: 1000,
    });
    expect(errs).toEqual([]);
  });

  it('blocks pickup skills that alias a career package skill', () => {
    const rng = makeRng(52);
    const { skills } = distributeCareerSkills('Solo', rng);
    const careerValues = Object.fromEntries(skills.map((s) => [s.name, s.value])) as Record<string, number>;
    const statBases = {
      int: 7,
      ref: 8,
      tech: 5,
      cool: 5,
      attr: 5,
      luck: 5,
      ma: 5,
      bt: 5,
      emp: 5,
    };
    const errs = validateCp2020Chargen({
      sessionId: '00000000-0000-4000-8000-000000000096',
      userId: 'u',
      name: 'x',
      role: 'Solo',
      age: 24,
      points: 50,
      statBases,
      careerValuesByName: careerValues,
      pickup: [{ name: 'Notice', value: 3 }],
      eurobucks: 1000,
    });
    expect(errs.some((e) => e.includes('overlaps the career package'))).toBe(true);
  });

  it('buildCp2020CharacterFromChargen matches a rolled Solo baseline', () => {
    const rng = makeRng(202);
    const role = 'Solo' as const;
    const points = resolveCharacterPoints('fast', rng);
    const statBases = {
      int: 0,
      ref: 0,
      tech: 0,
      cool: 0,
      attr: 0,
      luck: 0,
      ma: 0,
      bt: 0,
      emp: 0,
    };
    const alloc = allocateStatsFromCharacterPoints(points, rng);
    for (const k of ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'] as const) {
      statBases[k] = alloc[k].base;
    }
    const { skills: career } = distributeCareerSkills(role, rng);
    const careerValues = Object.fromEntries(career.map((s) => [s.name, s.value]));
    const pickupS = distributePickupSkills(new Set(career.map((s) => s.name)), statBases.ref, statBases.int, rng);
    const spec = career.find((s) => s.isSpecialAbility)?.value ?? 1;
    const c = buildCp2020CharacterFromChargen({
      sessionId: '00000000-0000-4000-8000-000000000088',
      userId: 'player-1',
      name: 'Build Test',
      role,
      age: 28,
      points,
      statBases,
      careerValuesByName: careerValues,
      pickup: pickupS.map((s) => ({ name: s.name, value: s.value })),
      eurobucks: 2400,
    });
    expect(c.skills.length).toBe(career.length + pickupS.filter((s) => s.value > 0).length);
    expect(c.points).toBe(points);
    expect(c.specialAbility.value).toBe(spec);
    expect(c.derivedStats).toBeDefined();
  });
});
