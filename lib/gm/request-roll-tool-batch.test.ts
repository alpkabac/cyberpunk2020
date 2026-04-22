import { describe, it, expect } from 'vitest';
import {
  collectPlayerCharacterIdsFromRequestRollCalls,
  shouldSuppressRollDiceAfterRequestRoll,
} from './request-roll-tool-batch';
import type { OpenRouterToolCall } from './context-builder';
import type { Character } from '@/lib/types';

function tc(name: string, args: Record<string, unknown>): OpenRouterToolCall {
  return {
    id: '1',
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

const pc: Character = {
  id: 'pc1',
} as Character;
(pc as { type: 'character' | 'npc' }).type = 'character';
(pc as { isNpc: boolean }).isNpc = false;

const npc: Character = { id: 'n1' } as Character;
(npc as { type: 'character' | 'npc' }).type = 'npc';
(npc as { isNpc: boolean }).isNpc = true;

const map = new Map<string, Character>([
  ['pc1', pc],
  ['n1', npc],
]);

describe('collectPlayerCharacterIdsFromRequestRollCalls', () => {
  it('collects PC id from request_roll', () => {
    const s = collectPlayerCharacterIdsFromRequestRollCalls(
      [tc('request_roll', { character_id: 'pc1', roll_kind: 'raw_formula', formula: '1d10' })],
      map,
    );
    expect([...s]).toEqual(['pc1']);
  });

  it('ignores NPC character_id on request_roll', () => {
    const s = collectPlayerCharacterIdsFromRequestRollCalls(
      [tc('request_roll', { character_id: 'n1', roll_kind: 'raw_formula', formula: '1d10' })],
      map,
    );
    expect(s.size).toBe(0);
  });
});

describe('shouldSuppressRollDiceAfterRequestRoll', () => {
  it('suppresses roll_dice for same PC when request_roll target set', () => {
    const ids = new Set(['pc1']);
    expect(shouldSuppressRollDiceAfterRequestRoll(JSON.stringify({ character_id: 'pc1', formula: '1d10' }), ids)).toBe(
      true,
    );
    expect(shouldSuppressRollDiceAfterRequestRoll(JSON.stringify({ character_id: 'n1', formula: '1d10' }), ids)).toBe(
      false,
    );
    expect(shouldSuppressRollDiceAfterRequestRoll(JSON.stringify({ formula: '1d10' }), ids)).toBe(false);
  });
});
