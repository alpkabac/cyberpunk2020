import { describe, expect, it } from 'vitest';
import {
  armorWeaponTableIndex,
  buildFastSystemNpc,
  formatNpcSpawnAnnouncement,
} from './cp2020-fast-npc';

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('cp2020-fast-npc', () => {
  it('buildFastSystemNpc produces NPC with gear and valid stats', () => {
    const rng = makeRng(99);
    const { character: c, gearSummary } = buildFastSystemNpc({
      sessionId: '00000000-0000-4000-8000-000000000099',
      name: 'Test Ganger',
      role: 'Solo',
      threat: 'average',
      rng,
    });
    expect(c.type).toBe('npc');
    expect(c.isNpc).toBe(true);
    expect(c.items.length).toBeGreaterThanOrEqual(2);
    expect(gearSummary.length).toBeGreaterThan(3);
    for (const k of ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'] as const) {
      expect(c.stats[k].base).toBeGreaterThanOrEqual(2);
      expect(c.stats[k].base).toBeLessThanOrEqual(10);
    }
    expect(c.skills.length).toBeGreaterThanOrEqual(10);
  });

  it('capable threat adds extra pickup skills', () => {
    const rng = makeRng(7);
    const { character: c } = buildFastSystemNpc({
      sessionId: 's',
      name: 'Elite',
      role: 'Cop',
      threat: 'capable',
      rng,
    });
    expect(c.skills.length).toBeGreaterThan(10);
  });

  it('stat overrides clamp and apply', () => {
    const rng = makeRng(3);
    const { character: c } = buildFastSystemNpc({
      sessionId: 's',
      name: 'X',
      role: 'Fixer',
      threat: 'mook',
      rng,
      statOverrides: { ref: 9 },
    });
    expect(c.stats.ref.base).toBe(9);
  });

  it('armorWeaponTableIndex stays in 1–10', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 20; i++) {
      expect(armorWeaponTableIndex('Solo', rng)).toBeGreaterThanOrEqual(1);
      expect(armorWeaponTableIndex('Solo', rng)).toBeLessThanOrEqual(10);
    }
  });

  it('formatNpcSpawnAnnouncement includes role and gear', () => {
    const rng = makeRng(1);
    const { character: c, gearSummary } = buildFastSystemNpc({
      sessionId: 's',
      name: 'Viktor',
      role: 'Corp',
      threat: 'elite',
      rng,
    });
    const line = formatNpcSpawnAnnouncement(c, 'elite', gearSummary);
    expect(line).toContain('Viktor');
    expect(line).toContain('Corp');
    expect(line).toContain('elite');
  });
});
