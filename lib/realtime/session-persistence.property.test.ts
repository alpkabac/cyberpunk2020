/**
 * Property 1: Session Persistence Round-Trip
 * Validates: Requirements 1.4, 11.1, 11.2, 11.3
 *
 * For any valid session entity (Character, Token, ChatMessage), serialising it
 * to a Postgres-row representation and then deserialising it via the db-mapper
 * functions must produce an object that is semantically equivalent to the
 * original.  This guards against silent data-loss in the mapper layer (the
 * only place where the app's in-memory model meets the database wire format).
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  characterRowToCharacter,
  chatRowToMessage,
  tokenRowToToken,
} from './db-mapper';
import type { Character, ChatMessage, Token, RoleType } from '../types';

// ---------------------------------------------------------------------------
// Helpers: Character → Postgres row (snake_case projection)
// ---------------------------------------------------------------------------

function characterToRow(c: Character): Record<string, unknown> {
  return {
    id: c.id,
    user_id: c.userId || null,
    session_id: c.sessionId,
    name: c.name,
    type: c.type,
    role: c.role,
    age: c.age,
    points: c.points,
    stats: c.stats,
    special_ability: c.specialAbility,
    reputation: c.reputation,
    improvement_points: c.improvementPoints,
    skills: c.skills,
    damage: c.damage,
    is_stunned: c.isStunned,
    is_stabilized: c.isStabilized,
    conditions: c.conditions,
    hit_locations: c.hitLocations,
    sdp: c.sdp,
    eurobucks: c.eurobucks,
    items: c.items,
    combat_modifiers: c.combatModifiers ?? null,
    netrun_deck: c.netrunDeck ?? null,
    lifepath: c.lifepath ?? null,
    team: c.team ?? '',
    image_url: c.imageUrl,
  };
}

function tokenToRow(t: Token): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    image_url: t.imageUrl,
    x: t.x,
    y: t.y,
    size: t.size,
    controlled_by: t.controlledBy,
    character_id: t.characterId ?? null,
  };
}

function chatMessageToRow(m: ChatMessage): Record<string, unknown> {
  return {
    id: m.id,
    speaker: m.speaker,
    text: m.text,
    created_at: new Date(m.timestamp).toISOString(),
    type: m.type,
    metadata: m.metadata ?? null,
  };
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

const ROLES: RoleType[] = ['Solo', 'Netrunner', 'Techie', 'Medtechie', 'Media', 'Cop', 'Corp', 'Fixer', 'Nomad', 'Rockerboy'];

const arbRole = fc.constantFrom(...ROLES);
const arbCharType = fc.constantFrom('character', 'npc') as fc.Arbitrary<'character' | 'npc'>;

const arbCharacter: fc.Arbitrary<Character> = fc.record({
  id: fc.uuid(),
  userId: fc.oneof(fc.constant(''), fc.uuid()),
  sessionId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  type: arbCharType,
  isNpc: fc.constant(false), // derived; will be re-derived from type
  team: fc.string({ maxLength: 32 }),
  imageUrl: fc.constant(''),
  role: arbRole,
  age: fc.integer({ min: 16, max: 60 }),
  points: fc.integer({ min: 0, max: 100 }),
  stats: fc.constant({} as Character['stats']),
  specialAbility: fc.record({ name: fc.string({ maxLength: 30 }), value: fc.integer({ min: 0, max: 10 }) }),
  reputation: fc.integer({ min: 0, max: 10 }),
  improvementPoints: fc.integer({ min: 0, max: 500 }),
  skills: fc.constant([]),
  damage: fc.integer({ min: 0, max: 40 }),
  isStunned: fc.boolean(),
  isStabilized: fc.boolean(),
  conditions: fc.constant([]),
  hitLocations: fc.constant({} as Character['hitLocations']),
  sdp: fc.constant({
    sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
    current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
  }),
  eurobucks: fc.integer({ min: 0, max: 100_000 }),
  items: fc.constant([]),
  combatModifiers: fc.constant(undefined),
  netrunDeck: fc.constant(null),
  lifepath: fc.constant(null),
}).map(
  (c): Character => ({
    ...c,
    isNpc: c.type === 'npc',
    skills: [],
    conditions: [],
    items: [],
  }),
);

const arbToken: fc.Arbitrary<Token> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  imageUrl: fc.constant(''),
  x: fc.float({ min: 0, max: 100, noNaN: true }),
  y: fc.float({ min: 0, max: 100, noNaN: true }),
  size: fc.integer({ min: 20, max: 120 }),
  controlledBy: fc.constantFrom('gm', 'player') as fc.Arbitrary<'gm' | 'player'>,
  characterId: fc.oneof(fc.constant(null), fc.uuid()),
});

const arbChatMessage: fc.Arbitrary<ChatMessage> = fc.record({
  id: fc.uuid(),
  speaker: fc.string({ minLength: 1, maxLength: 40 }),
  text: fc.string({ maxLength: 500 }),
  timestamp: fc.integer({ min: 1_000_000, max: Date.now() }),
  type: fc.constantFrom('player', 'narration', 'system', 'roll') as fc.Arbitrary<ChatMessage['type']>,
  metadata: fc.constant(undefined),
});

// ---------------------------------------------------------------------------
// Property 1 tests
// ---------------------------------------------------------------------------

describe('Property 1: Session Persistence Round-Trip — Character', () => {
  it('characterRowToCharacter is a left-inverse of characterToRow for scalar fields', () => {
    fc.assert(
      fc.property(arbCharacter, (original) => {
        const row = characterToRow(original);
        const restored = characterRowToCharacter(row);

        expect(restored.id).toBe(original.id);
        expect(restored.sessionId).toBe(original.sessionId);
        expect(restored.name).toBe(original.name);
        expect(restored.role).toBe(original.role);
        expect(restored.age).toBe(original.age);
        expect(restored.points).toBe(original.points);
        expect(restored.damage).toBe(original.damage);
        expect(restored.isStunned).toBe(original.isStunned);
        expect(restored.eurobucks).toBe(original.eurobucks);
        expect(restored.reputation).toBe(original.reputation);
        expect(restored.improvementPoints).toBe(original.improvementPoints);
        expect(restored.team).toBe(original.team);
      }),
      { numRuns: 100 },
    );
  });

  it('type / isNpc flag survives the round-trip', () => {
    fc.assert(
      fc.property(arbCharacter, (original) => {
        const restored = characterRowToCharacter(characterToRow(original));
        expect(restored.type).toBe(original.type);
        expect(restored.isNpc).toBe(original.type === 'npc');
      }),
      { numRuns: 100 },
    );
  });

  it('userId is preserved (empty string maps through null gracefully)', () => {
    fc.assert(
      fc.property(arbCharacter, (original) => {
        const row = characterToRow(original);
        const restored = characterRowToCharacter(row);
        // null user_id → empty userId; non-null → same value
        const expectedUserId = original.userId || '';
        expect(restored.userId).toBe(expectedUserId);
      }),
      { numRuns: 100 },
    );
  });

  it('applying the mapper twice yields the same result (idempotent)', () => {
    fc.assert(
      fc.property(arbCharacter, (original) => {
        const firstPass = characterRowToCharacter(characterToRow(original));
        const secondPass = characterRowToCharacter(characterToRow(firstPass));

        expect(secondPass.id).toBe(firstPass.id);
        expect(secondPass.damage).toBe(firstPass.damage);
        expect(secondPass.isNpc).toBe(firstPass.isNpc);
        expect(secondPass.role).toBe(firstPass.role);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 1: Session Persistence Round-Trip — Token', () => {
  it('tokenRowToToken is a left-inverse of tokenToRow', () => {
    fc.assert(
      fc.property(arbToken, (original) => {
        const row = tokenToRow(original);
        const restored = tokenRowToToken(row);

        expect(restored.id).toBe(original.id);
        expect(restored.name).toBe(original.name);
        expect(restored.x).toBeCloseTo(original.x, 5);
        expect(restored.y).toBeCloseTo(original.y, 5);
        expect(restored.size).toBe(original.size);
        expect(restored.controlledBy).toBe(original.controlledBy);
        expect(restored.characterId).toBe(original.characterId);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 1: Session Persistence Round-Trip — ChatMessage', () => {
  it('chatRowToMessage is a left-inverse of chatMessageToRow', () => {
    fc.assert(
      fc.property(arbChatMessage, (original) => {
        const row = chatMessageToRow(original);
        const restored = chatRowToMessage(row);

        expect(restored.id).toBe(original.id);
        expect(restored.speaker).toBe(original.speaker);
        expect(restored.text).toBe(original.text);
        expect(restored.type).toBe(original.type);
        // Timestamp round-trips through ISO string; allow ±1 ms for JS Date precision
        expect(Math.abs(restored.timestamp - original.timestamp)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});
