/**
 * Property 22: Client Reconnection State Sync (Requirements 10.3)
 * Property 23: Optimistic Update Rollback (Requirements 10.5)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Character } from '../types';
import {
  resolveCharacterConflict,
  snapshotEntitiesArePresentInHydration,
  idsFromCharacters,
  idsFromTokens,
  idsFromChat,
  type SessionSnapshotSlice,
} from './conflict-resolution';

const minimalCharacter = (id: string): Character => ({
  id,
  userId: 'u',
  sessionId: 's',
  name: 'n',
  type: 'character',
  isNpc: false,
  imageUrl: '',
  role: 'Solo',
  age: 20,
  points: 0,
  stats: {} as Character['stats'],
  specialAbility: { name: '', value: 0 },
  reputation: 0,
  improvementPoints: 0,
  skills: [],
  damage: 0,
  isStunned: false,
  conditions: [],
  hitLocations: {} as Character['hitLocations'],
  sdp: {
    sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
  },
  eurobucks: 0,
  items: [],
  netrunDeck: null,
  lifepath: null,
});

const arbCharacter = (prefix: string) =>
  fc.uuid().map((id) => ({
    ...minimalCharacter(`${prefix}-${id}`),
  }));

const arbToken = (prefix: string) =>
  fc.uuid().map((id) => ({
    id: `${prefix}-${id}`,
    name: 'T',
    imageUrl: '',
    x: 0,
    y: 0,
    size: 40,
    controlledBy: 'player' as const,
  }));

const arbChat = (prefix: string) =>
  fc.uuid().map((id) => ({
    id: `${prefix}-${id}`,
    speaker: 'S',
    text: 'hi',
    timestamp: 1,
    type: 'player' as const,
  }));

describe('Property 22: Client Reconnection State Sync', () => {
  it('snapshot coverage predicate: full hydration passes; dropping an ID fails', () => {
    fc.assert(
      fc.property(
        fc.array(arbCharacter('c'), { minLength: 0, maxLength: 8 }),
        fc.array(arbToken('t'), { minLength: 0, maxLength: 8 }),
        fc.array(arbChat('m'), { minLength: 0, maxLength: 8 }),
        (characters, tokens, chatMessages) => {
          const snapshot: SessionSnapshotSlice = { characters, tokens, chatMessages };

          const okFull = snapshotEntitiesArePresentInHydration(
            snapshot,
            idsFromCharacters(characters),
            idsFromTokens(tokens),
            idsFromChat(chatMessages),
          );
          expect(okFull).toBe(true);

          if (characters.length > 0) {
            const dropped = new Set(idsFromCharacters(characters));
            dropped.delete(characters[0].id);
            expect(
              snapshotEntitiesArePresentInHydration(snapshot, dropped, idsFromTokens(tokens), idsFromChat(chatMessages)),
            ).toBe(false);
          }
          if (tokens.length > 0) {
            const dropped = new Set(idsFromTokens(tokens));
            dropped.delete(tokens[0].id);
            expect(
              snapshotEntitiesArePresentInHydration(
                snapshot,
                idsFromCharacters(characters),
                dropped,
                idsFromChat(chatMessages),
              ),
            ).toBe(false);
          }
          if (chatMessages.length > 0) {
            const dropped = new Set(idsFromChat(chatMessages));
            dropped.delete(chatMessages[0].id);
            expect(
              snapshotEntitiesArePresentInHydration(
                snapshot,
                idsFromCharacters(characters),
                idsFromTokens(tokens),
                dropped,
              ),
            ).toBe(false);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Property 23: Optimistic Update Rollback', () => {
  it('uses authoritative character when conflict is true', () => {
    fc.assert(
      fc.property(arbCharacter('L'), arbCharacter('A'), (local, authoritative) => {
        const merged = resolveCharacterConflict(local, authoritative, true);
        expect(merged).toEqual(authoritative);
      }),
      { numRuns: 50 },
    );
  });

  it('keeps local character when conflict is false', () => {
    fc.assert(
      fc.property(arbCharacter('L'), arbCharacter('A'), (local, authoritative) => {
        const merged = resolveCharacterConflict(local, authoritative, false);
        expect(merged).toEqual(local);
      }),
      { numRuns: 50 },
    );
  });
});
