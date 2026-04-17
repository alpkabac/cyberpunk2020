import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Token } from '../types';
import { canDragToken, type TokenDragContext } from './token-drag-permissions';

function makeToken(partial: Partial<Token> & Pick<Token, 'id' | 'controlledBy'>): Token {
  return {
    id: partial.id,
    name: partial.name ?? 'T',
    imageUrl: partial.imageUrl ?? '',
    x: partial.x ?? 50,
    y: partial.y ?? 50,
    size: partial.size ?? 40,
    controlledBy: partial.controlledBy,
    characterId: partial.characterId ?? null,
  };
}

describe('Property 20: Token Ownership (drag permission invariants)', () => {
  it('non-GM never drags gm-controlled tokens', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), fc.boolean(), (userId, charId, allowMove) => {
        const token = makeToken({ id: 't1', controlledBy: 'gm' });
        const ctx: TokenDragContext = {
          userId,
          isGm: false,
          allowPlayerTokenMovement: allowMove,
          characterOwnerById: { [charId]: userId },
        };
        return canDragToken(token, ctx) === false;
      }),
      { numRuns: 80 },
    );
  });

  it('GM drags gm-controlled tokens', () => {
    fc.assert(
      fc.property(fc.uuid(), (gmId) => {
        const token = makeToken({ id: 't1', controlledBy: 'gm' });
        const ctx: TokenDragContext = {
          userId: gmId,
          isGm: true,
          allowPlayerTokenMovement: false,
          characterOwnerById: {},
        };
        return canDragToken(token, ctx) === true;
      }),
      { numRuns: 40 },
    );
  });

  it('player drags own character token only when movement allowed and character_id matches', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), fc.uuid(), (userId, otherId, charId) => {
        fc.pre(userId !== otherId);
        const token = makeToken({ id: 't1', controlledBy: 'player', characterId: charId });
        const allowed: TokenDragContext = {
          userId,
          isGm: false,
          allowPlayerTokenMovement: true,
          characterOwnerById: { [charId]: userId },
        };
        const deniedWrongOwner: TokenDragContext = {
          ...allowed,
          characterOwnerById: { [charId]: otherId },
        };
        const deniedFlag: TokenDragContext = {
          ...allowed,
          allowPlayerTokenMovement: false,
        };
        const deniedNoChar: TokenDragContext = {
          ...allowed,
          characterOwnerById: {},
        };
        return (
          canDragToken(token, allowed) === true &&
          canDragToken(token, deniedWrongOwner) === false &&
          canDragToken(token, deniedFlag) === false &&
          canDragToken(token, deniedNoChar) === false
        );
      }),
      { numRuns: 80 },
    );
  });

  it('player token without character_id is never draggable by players', () => {
    const token = makeToken({ id: 't1', controlledBy: 'player', characterId: null });
    const ctx: TokenDragContext = {
      userId: 'u1',
      isGm: false,
      allowPlayerTokenMovement: true,
      characterOwnerById: {},
    };
    expect(canDragToken(token, ctx)).toBe(false);
  });
});
