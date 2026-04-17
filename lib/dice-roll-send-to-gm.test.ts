import { describe, it, expect } from 'vitest';
import {
  buildGmDiceRollMessage,
  mergeVoiceAndQueuedRollsChronologically,
  sheetRollContext,
} from './dice-roll-send-to-gm';
import type { Character } from './types';
import { createStatBlock } from './types';

const tinyChar = { id: 'c1', name: 'Johnny' } as Character;

describe('buildGmDiceRollMessage', () => {
  it('formats gm_request with rollSummary and dice detail', () => {
    const m = buildGmDiceRollMessage(
      {
        kind: 'gm_request',
        sessionId: 's',
        formula: '1d10+5',
        speakerName: 'P',
        rollSummary: 'Rifle (Aimed)',
      },
      '1d10+5',
      { total: 12, rolls: [7, 5] },
    );
    expect(m).not.toBeNull();
    expect(m!.sessionId).toBe('s');
    expect(m!.playerMessage).toBe(
      '[Roll] 1d10+5 = 12 (dice: 7, 5) — Rifle (Aimed)',
    );
  });

  it('formats custom sheet roll with session', () => {
    const m = buildGmDiceRollMessage(
      {
        kind: 'custom',
        characterId: 'c1',
        rollSummary: 'Malorian Arms damage',
        sessionId: 'sess-1',
        speakerName: 'Johnny',
      },
      '4d6+2',
      { total: 18, rolls: [4, 5, 5, 4] },
    );
    expect(m).not.toBeNull();
    expect(m!.playerMessage).toBe(
      'Johnny rolled 18 for Malorian Arms damage (4d6+2)',
    );
    expect(m!.sessionId).toBe('sess-1');
  });

  it('uses default labels for stun when rollSummary omitted', () => {
    const m = buildGmDiceRollMessage(
      { kind: 'stun', characterId: 'c1', saveTarget: 6, sessionId: 's', speakerName: 'Jane' },
      'flat:1d10',
      { total: 4, rolls: [4] },
    );
    expect(m!.playerMessage).toContain('Stun save');
    expect(m!.playerMessage).toContain('≤6');
    expect(m!.playerMessage).toContain('stayed conscious');
  });

  it('formats attack with DV as HIT or MISS and target', () => {
    const hit = buildGmDiceRollMessage(
      {
        kind: 'attack',
        characterId: 'c1',
        weaponId: 'w1',
        reliability: 'ST',
        isMelee: false,
        isAutoWeapon: false,
        difficultyValue: 20,
        rangeBracketLabel: 'Medium',
        targetCharacterId: 'npc1',
        targetName: 'Ganger',
        sessionId: 's',
        speakerName: 'Jane',
      },
      '1d10+12',
      { total: 22, rolls: [10] },
    );
    expect(hit).not.toBeNull();
    expect(hit!.playerMessage).toContain('**HIT**');
    expect(hit!.playerMessage).toContain('vs DV **20**');
    expect(hit!.playerMessage).toContain('Ganger');

    const miss = buildGmDiceRollMessage(
      {
        kind: 'attack',
        characterId: 'c1',
        weaponId: 'w1',
        reliability: 'ST',
        isMelee: false,
        isAutoWeapon: false,
        difficultyValue: 25,
        sessionId: 's',
        speakerName: 'Jane',
      },
      '1d10+8',
      { total: 15, rolls: [7] },
    );
    expect(miss).not.toBeNull();
    expect(miss!.playerMessage).toContain('**MISS**');
  });
});

describe('mergeVoiceAndQueuedRollsChronologically', () => {
  it('orders voice vs rolls by timestamps and labels segments', () => {
    const t0 = new Date('2026-01-01T12:00:00Z').getTime();
    const t1 = t0 + 5000;
    const m = mergeVoiceAndQueuedRollsChronologically({
      voice: {
        playerMessage: 'I agree.',
        recordingStartedAtMs: t1,
        sttCompletedAtMs: t1,
      },
      rolls: [{ rolledAtMs: t0, playerMessage: '[Roll] 1d10 = 5 — test' }],
    });
    expect(m.playerMessage).toContain('Roll');
    expect(m.playerMessage).toContain('Voice');
    expect(m.playerMessage.indexOf('1d10')).toBeLessThan(m.playerMessage.indexOf('I agree'));
  });
});

describe('sheetRollContext', () => {
  it('includes character name and roll summary', () => {
    const c = {
      ...tinyChar,
      stats: {
        int: createStatBlock(5, 0),
        ref: createStatBlock(5, 0),
        tech: createStatBlock(5, 0),
        cool: createStatBlock(5, 0),
        attr: createStatBlock(5, 0),
        luck: createStatBlock(5, 0),
        ma: createStatBlock(5, 0),
        bt: createStatBlock(5, 0),
        emp: createStatBlock(5, 0),
      },
    } as Character;
    expect(sheetRollContext(c, 'sid', 'Initiative')).toEqual({
      rollSummary: 'Initiative',
      sessionId: 'sid',
      speakerName: 'Johnny',
    });
  });
});
