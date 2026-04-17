import { describe, expect, it } from 'vitest';
import { buildUniqueGmNpc, formatUniqueNpcAnnouncement, itemFromGmSpawnBlob } from './spawn-unique-npc';

describe('spawn-unique-npc', () => {
  it('itemFromGmSpawnBlob builds a weapon with defaults', () => {
    const w = itemFromGmSpawnBlob({
      name: 'Test Gun',
      type: 'weapon',
      damage: '3d6',
      weapon_type: 'Rifle',
    });
    expect(w).not.toBeNull();
    expect(w?.type).toBe('weapon');
    if (w?.type === 'weapon') {
      expect(w.damage).toBe('3d6');
      expect(w.weaponType).toBe('Rifle');
    }
  });

  it('buildUniqueGmNpc applies stats and custom skills', () => {
    const c = buildUniqueGmNpc({
      sessionId: 'sess',
      name: 'Boss',
      role: 'Solo',
      stats: { ref: 10, cool: 8 },
      specialAbility: { name: 'Combat Sense', value: 9 },
      skills: [{ name: 'Full Borg', value: 10, linkedStat: 'tech', category: 'Custom' }],
      items: [],
      age: 40,
      reputation: 0,
      improvementPoints: 0,
      eurobucks: 0,
      damage: 0,
      imageUrl: '',
    });
    expect(c.stats.ref.base).toBe(10);
    expect(c.stats.int.base).toBe(6);
    expect(c.skills.some((s) => s.name === 'Full Borg' && s.value === 10)).toBe(true);
    expect(c.specialAbility.name).toBe('Combat Sense');
    const line = formatUniqueNpcAnnouncement(c);
    expect(line).toContain('Boss');
    expect(line).toContain('Solo');
  });
});
