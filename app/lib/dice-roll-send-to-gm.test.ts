import { describe, it, expect } from 'vitest';
import { buildGmDiceRollMessage, sheetRollContext } from './dice-roll-send-to-gm';
import type { Character } from './types';
import { createStatBlock } from './types';

const tinyChar = { id: 'c1', name: 'Johnny' } as Character;

describe('buildGmDiceRollMessage', () => {
  it('returns null for gm_request', () => {
    expect(
      buildGmDiceRollMessage(
        {
          kind: 'gm_request',
          sessionId: 's',
          formula: '1d10',
          speakerName: 'P',
        },
        '1d10+5',
        12,
      ),
    ).toBeNull();
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
      18,
    );
    expect(m).not.toBeNull();
    expect(m!.playerMessage).toBe(
      'Johnny rolled 18 for Malorian Arms damage (4d6+2)',
    );
    expect(m!.sessionId).toBe('sess-1');
  });

  it('uses default labels for stun when rollSummary omitted', () => {
    const m = buildGmDiceRollMessage(
      { kind: 'stun', characterId: 'c1', sessionId: 's', speakerName: 'Jane' },
      'flat:1d10',
      4,
    );
    expect(m!.playerMessage).toContain('Stun save');
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
