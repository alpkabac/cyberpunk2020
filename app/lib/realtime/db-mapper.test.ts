import { describe, expect, it } from 'vitest';
import type { Character } from '../types';
import { mergeCharacterRowWithRealtime, normalizeCharacterItems, characterRowToCharacter } from './db-mapper';

const minimalChar = (id: string): Character => ({
  id,
  userId: '',
  sessionId: 's',
  name: 'N',
  type: 'npc',
  isNpc: true,
  imageUrl: '',
  role: 'Solo',
  age: 30,
  points: 45,
  stats: {} as Character['stats'],
  specialAbility: { name: 'Combat Sense', value: 5 },
  reputation: 0,
  improvementPoints: 0,
  skills: [{ id: 'sk1', name: 'Handgun', value: 6, linkedStat: 'ref', category: 'Combat', isChipped: false }],
  damage: 0,
  isStunned: false,
  conditions: [],
  hitLocations: {} as Character['hitLocations'],
  sdp: {
    sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
  },
  eurobucks: 0,
  items: [
    {
      id: 'w1',
      name: 'Pistol',
      type: 'weapon',
      flavor: '',
      notes: '',
      cost: 0,
      weight: 1,
      equipped: true,
      source: 't',
      weaponType: 'Pistol',
      accuracy: 0,
      concealability: 'J',
      availability: 'E',
      ammoType: '9mm',
      damage: '2d6+3',
      ap: false,
      shotsLeft: 10,
      shots: 10,
      rof: 2,
      reliability: 'ST',
      range: 50,
      attackType: 'ranged',
      attackSkill: 'Handgun',
      isAutoCapable: false,
    },
  ],
  combatModifiers: { initiative: 0, stunSave: 0 },
  netrunDeck: null,
  lifepath: null,
});

describe('normalizeCharacterItems', () => {
  it('coerces snake_case weapon rows into Weapon items', () => {
    const items = normalizeCharacterItems([
      {
        id: 'w1',
        name: 'Falcon',
        type: 'weapon',
        weapon_type: 'Pistol',
        damage: '3d6',
        shots: 8,
        shots_left: 8,
        rof: 2,
        range: 50,
        accuracy: 0,
        concealability: 'J',
        availability: 'E',
        ammo_type: '11mm',
        ap: false,
        reliability: 'ST',
        attack_type: 'ranged',
        attack_skill: 'Handgun',
        equipped: true,
        flavor: '',
        notes: '',
        cost: 0,
        weight: 1,
        source: 'test',
        is_auto_capable: false,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('weapon');
    if (items[0].type === 'weapon') {
      expect(items[0].weaponType).toBe('Pistol');
      expect(items[0].damage).toBe('3d6');
      expect(items[0].attackSkill).toBe('Handgun');
      expect(items[0].ammoType).toBe('11mm');
    }
  });

  it('characterRowToCharacter runs normalization on items', () => {
    const c = characterRowToCharacter({
      id: 'x',
      session_id: 's',
      user_id: null,
      name: 'N',
      type: 'npc',
      role: 'Solo',
      stats: {},
      items: [
        {
          name: 'Knife',
          weapon_type: 'Melee',
          damage: '1d6+2',
          shots: 0,
          shots_left: 0,
          rof: 0,
          range: 1,
          accuracy: 0,
          concealability: 'P',
          availability: 'E',
          ammo_type: '—',
          reliability: 'ST',
          attack_type: 'melee',
          attack_skill: 'Melee',
        },
      ],
    });
    const w = c.items.filter((i) => i.type === 'weapon');
    expect(w.length).toBeGreaterThanOrEqual(1);
  });
});

describe('mergeCharacterRowWithRealtime', () => {
  it('preserves items and skills when row only patches damage', () => {
    const existing = minimalChar('c1');
    const row: Record<string, unknown> = {
      id: 'c1',
      session_id: 's',
      user_id: null,
      name: 'N',
      type: 'npc',
      damage: 8,
    };
    const merged = mergeCharacterRowWithRealtime(existing, row);
    expect(merged.damage).toBe(8);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].name).toBe('Pistol');
    expect(merged.skills).toHaveLength(1);
  });
});
