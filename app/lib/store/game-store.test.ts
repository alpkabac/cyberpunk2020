/**
 * Tests for the Zustand game store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, selectAllCharacters, selectCharacterById } from './game-store';
import { Character, createStatBlock, Item, ChatMessage, Token } from '../types';

describe('Game Store', () => {
  beforeEach(() => {
    // Reset store before each test
    useGameStore.getState().reset();
  });

  describe('Character Management', () => {
    it('should add a character', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);

      const state = useGameStore.getState();
      const characters = selectAllCharacters(state);
      
      expect(characters).toHaveLength(1);
      expect(characters[0].id).toBe('char-1');
      expect(characters[0].derivedStats).toBeDefined();
      expect(characters[0].derivedStats?.btm).toBe(3); // BT 8 -> BTM 3 (8 is in range 8-9)
    });

    it('should update a character', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().updateCharacter('char-1', { name: 'Updated Name' });

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');
      
      expect(updatedChar?.name).toBe('Updated Name');
    });

    it('should remove a character', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().removeCharacter('char-1');

      const state = useGameStore.getState();
      const characters = selectAllCharacters(state);
      
      expect(characters).toHaveLength(0);
    });
  });

  describe('Damage Application', () => {
    it('should apply damage and update wound state', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 10, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [
          {
            id: 'helmet-1',
            name: 'Steel Helmet',
            type: 'armor' as const,
            flavor: '',
            notes: '',
            cost: 100,
            weight: 1,
            equipped: true,
            source: 'Test',
            coverage: {
              Head: { stoppingPower: 10, ablation: 0 },
              Torso: { stoppingPower: 0, ablation: 0 },
              rArm: { stoppingPower: 0, ablation: 0 },
              lArm: { stoppingPower: 0, ablation: 0 },
              rLeg: { stoppingPower: 0, ablation: 0 },
              lLeg: { stoppingPower: 0, ablation: 0 },
            },
            encumbrance: 0,
          } as any,
        ],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().applyDamage('char-1', 6, 'Head');

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');
      
      // Pipeline: 6 × 2 (head) = 12, - SP 10 = 2, - BTM 3 = 0 final damage
      expect(updatedChar?.damage).toBe(0);
      expect(updatedChar?.derivedStats?.woundState).toBe('Uninjured');
      // SP stays at 10 (synced from armor), ablation incremented to 1 (effective SP = 9)
      expect(updatedChar?.hitLocations.Head.stoppingPower).toBe(10);
      expect(updatedChar?.hitLocations.Head.ablation).toBe(1);
    });
  });

  describe('Money Management', () => {
    it('should deduct money', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().deductMoney('char-1', 300);

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');
      
      expect(updatedChar?.eurobucks).toBe(700);
    });

    it('should not allow negative money', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 100,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().deductMoney('char-1', 300);

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');
      
      expect(updatedChar?.eurobucks).toBe(0);
    });
  });

  describe('Item Management', () => {
    it('should add an item', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      const item: Item = {
        id: 'item-1',
        name: 'Test Item',
        type: 'misc',
        flavor: 'A test item',
        notes: '',
        cost: 100,
        weight: 1,
        equipped: false,
        source: 'test',
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().addItem('char-1', item);

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');
      
      expect(updatedChar?.items).toHaveLength(1);
      expect(updatedChar?.items[0].id).toBe('item-1');
    });

    it('should remove an item', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [
          {
            id: 'item-1',
            name: 'Test Item',
            type: 'misc',
            flavor: 'A test item',
            notes: '',
            cost: 100,
            weight: 1,
            equipped: false,
            source: 'test',
          },
        ],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().removeItem('char-1', 'item-1');

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');
      
      expect(updatedChar?.items).toHaveLength(0);
    });
  });

  describe('Token Management', () => {
    it('should move a token', () => {
      const token: Token = {
        id: 'token-1',
        name: 'Test Token',
        imageUrl: '',
        x: 50,
        y: 50,
        size: 50,
        controlledBy: 'player',
      };

      useGameStore.getState().addToken(token);
      useGameStore.getState().moveToken('token-1', 75, 25);

      const state = useGameStore.getState();
      const tokens = state.map.tokens;
      
      expect(tokens[0].x).toBe(75);
      expect(tokens[0].y).toBe(25);
    });
  });

  describe('Chat Management', () => {
    it('should add a chat message', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        speaker: 'Test Player',
        text: 'Hello world',
        timestamp: Date.now(),
        type: 'player',
      };

      useGameStore.getState().addChatMessage(message);

      const state = useGameStore.getState();
      const messages = state.chat.messages;
      
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Hello world');
    });
  });

  describe('Character Field Updates', () => {
    it('should update a nested field', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 60,
        stats: {
          int: createStatBlock(7, 0),
          ref: createStatBlock(8, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(7, 0),
          attr: createStatBlock(6, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(6, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(6, 0),
        },
        specialAbility: { name: 'Combat Sense', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 0, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 1000,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().updateCharacterField('char-1', 'stats.ref.base', 10);

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');
      
      expect(updatedChar?.stats.ref.base).toBe(10);
    });
  });
});
