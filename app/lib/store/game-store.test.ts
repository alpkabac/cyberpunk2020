/**
 * Tests for the Zustand game store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, selectAllCharacters, selectCharacterById } from './game-store';
import { Character, createStatBlock, Item, ChatMessage, Token, Armor } from '../types';

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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
      const damageTestHelmet: Armor = {
        id: 'helmet-1',
        name: 'Steel Helmet',
        type: 'armor',
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
      };

      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
        items: [damageTestHelmet],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(character);
      useGameStore.getState().applyDamage('char-1', 6, 'Head');

      const state = useGameStore.getState();
      const updatedChar = selectCharacterById(state, 'char-1');

      // Pipeline: 6 × 2 (head) = 12, − SP 10 = 2 (penetrated),
      // − BTM 3 would be −1, but FNFF "BTM min 1" clamps to 1.
      expect(updatedChar?.damage).toBe(1);
      expect(updatedChar?.derivedStats?.woundState).toBe('Light');
      // SP stays at 10 (synced from armor), ablation incremented (penetrating hit).
      expect(updatedChar?.hitLocations.Head.stoppingPower).toBe(10);
      expect(updatedChar?.hitLocations.Head.ablation).toBe(1);
    });

    it('does not ablate armor when the attack fails to penetrate SP', () => {
      const jacket: Armor = {
        id: 'jacket-1',
        name: 'Armor Jacket',
        type: 'armor',
        flavor: '',
        notes: '',
        cost: 0,
        weight: 0,
        equipped: true,
        source: 'Test',
        coverage: {
          Head: { stoppingPower: 0, ablation: 0 },
          Torso: { stoppingPower: 20, ablation: 0 },
          rArm: { stoppingPower: 0, ablation: 0 },
          lArm: { stoppingPower: 0, ablation: 0 },
          rLeg: { stoppingPower: 0, ablation: 0 },
          lLeg: { stoppingPower: 0, ablation: 0 },
        },
        encumbrance: 0,
      };

      const c: Character = {
        id: 'char-ab',
        userId: 'u',
        sessionId: 's',
        name: 'Ab Target',
        type: 'character',
        isNpc: false,
        team: '',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 0,
        stats: {
          int: createStatBlock(5, 0),
          ref: createStatBlock(5, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(5, 0),
          attr: createStatBlock(5, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(5, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(5, 0),
        },
        specialAbility: { name: '', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        isStabilized: false,
        conditions: [],
        hitLocations: {
          Head: { location: [1], stoppingPower: 0, ablation: 0 },
          Torso: { location: [2, 3, 4], stoppingPower: 20, ablation: 0 },
          rArm: { location: [5], stoppingPower: 0, ablation: 0 },
          lArm: { location: [6], stoppingPower: 0, ablation: 0 },
          lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0 },
          rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0 },
        },
        sdp: {
          sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
          current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        },
        eurobucks: 0,
        items: [jacket],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(c);
      // 5 damage vs SP 20 → fully stopped, no penetration, no ablation.
      useGameStore.getState().applyDamage('char-ab', 5, 'Torso');

      const after = selectCharacterById(useGameStore.getState(), 'char-ab');
      expect(after?.damage).toBe(0);
      expect(after?.hitLocations.Torso.ablation).toBe(0);
    });

    it('head hit with >8 final damage kills instantly (FNFF limb-loss rule)', () => {
      const c: Character = {
        id: 'char-hk',
        userId: 'u',
        sessionId: 's',
        name: 'Head Kill',
        type: 'character',
        isNpc: false,
        team: '',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 0,
        stats: {
          int: createStatBlock(5, 0),
          ref: createStatBlock(5, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(5, 0),
          attr: createStatBlock(5, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(5, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(5, 0),
        },
        specialAbility: { name: '', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        isStabilized: false,
        conditions: [],
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
        eurobucks: 0,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(c);
      // 6 raw → ×2 head = 12, − BTM 3 = 9 > 8 → head auto-kill.
      useGameStore.getState().applyDamage('char-hk', 6, 'Head');

      const after = selectCharacterById(useGameStore.getState(), 'char-hk');
      expect(after?.damage).toBe(41);
      expect(after?.derivedStats?.woundState).toBe('Dead');
    });

    it('limb hit with >8 final damage forces Mortal 0 (limb severed)', () => {
      const c: Character = {
        id: 'char-lm',
        userId: 'u',
        sessionId: 's',
        name: 'Limb Sever',
        type: 'character',
        isNpc: false,
        team: '',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 0,
        stats: {
          int: createStatBlock(5, 0),
          ref: createStatBlock(5, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(5, 0),
          attr: createStatBlock(5, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(5, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(5, 0),
        },
        specialAbility: { name: '', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        isStabilized: false,
        conditions: [],
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
        eurobucks: 0,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(c);
      // 12 raw to right arm (no SP) − BTM 3 = 9 > 8 → severed, forced Mortal 0 (>=13).
      useGameStore.getState().applyDamage('char-lm', 12, 'rArm');

      const after = selectCharacterById(useGameStore.getState(), 'char-lm');
      expect(after?.damage).toBe(13);
      expect(after?.derivedStats?.woundState).toBe('Mortal0');
      // Persistent severance condition recorded for Body tab / GM context.
      expect(after?.conditions.some((cond) => cond.name === 'severed_right_arm')).toBe(true);
    });

    it('does not duplicate a severance condition on repeated limb hits', () => {
      const c: Character = {
        id: 'char-lm2',
        userId: 'u',
        sessionId: 's',
        name: 'Limb Sever 2',
        type: 'character',
        isNpc: false,
        team: '',
        imageUrl: '',
        role: 'Solo',
        age: 25,
        points: 0,
        stats: {
          int: createStatBlock(5, 0),
          ref: createStatBlock(5, 0),
          tech: createStatBlock(5, 0),
          cool: createStatBlock(5, 0),
          attr: createStatBlock(5, 0),
          luck: createStatBlock(5, 0),
          ma: createStatBlock(5, 0),
          bt: createStatBlock(8, 0),
          emp: createStatBlock(5, 0),
        },
        specialAbility: { name: '', value: 0 },
        reputation: 0,
        improvementPoints: 0,
        skills: [],
        damage: 0,
        isStunned: false,
        isStabilized: false,
        conditions: [],
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
        eurobucks: 0,
        items: [],
        netrunDeck: null,
        lifepath: null,
      };

      useGameStore.getState().addCharacter(c);
      useGameStore.getState().applyDamage('char-lm2', 12, 'rArm');
      useGameStore.getState().applyDamage('char-lm2', 12, 'rArm');

      const after = selectCharacterById(useGameStore.getState(), 'char-lm2');
      const severed = after?.conditions.filter((cond) => cond.name === 'severed_right_arm') ?? [];
      expect(severed.length).toBe(1);
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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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

  describe('UI preferences', () => {
    it('defaults includeSpecialAbilityInSkillRolls to false', () => {
      expect(useGameStore.getState().ui.includeSpecialAbilityInSkillRolls).toBe(false);
    });

    it('sets includeSpecialAbilityInSkillRolls', () => {
      useGameStore.getState().setIncludeSpecialAbilityInSkillRolls(true);
      expect(useGameStore.getState().ui.includeSpecialAbilityInSkillRolls).toBe(true);
      useGameStore.getState().setIncludeSpecialAbilityInSkillRolls(false);
      expect(useGameStore.getState().ui.includeSpecialAbilityInSkillRolls).toBe(false);
    });
  });

  describe('Stun and death saves', () => {
    it('applyStunSaveRollResult sets isStunned when roll exceeds target', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        isNpc: false,
        team: '',
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
        damage: 5,
        isStunned: false,
        isStabilized: false,
        conditions: [],
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
      // Serious: BT 8 + Serious(-1) → stun target 7
      useGameStore.getState().applyStunSaveRollResult('char-1', 8);
      expect(selectCharacterById(useGameStore.getState(), 'char-1')?.isStunned).toBe(true);

      useGameStore.getState().applyStunSaveRollResult('char-1', 7);
      expect(selectCharacterById(useGameStore.getState(), 'char-1')?.isStunned).toBe(false);
    });

    it('applyDeathSaveRollResult sets damage to 41 on failure', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        isNpc: false,
        team: '',
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
        damage: 13,
        isStunned: false,
        isStabilized: false,
        conditions: [],
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

      useGameStore.getState().addCharacter({ ...character, damage: 25 });
      // damage 25 → Mortal 3; death save target = BT 8 − 3 = 5
      useGameStore.getState().applyDeathSaveRollResult('char-1', 6);
      expect(selectCharacterById(useGameStore.getState(), 'char-1')?.damage).toBe(41);

      useGameStore.getState().reset();
      useGameStore.getState().addCharacter({ ...character, damage: 25 });
      useGameStore.getState().applyDeathSaveRollResult('char-1', 4);
      expect(selectCharacterById(useGameStore.getState(), 'char-1')?.damage).toBe(25);
    });

    it('optimistic character edit can be rolled back', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        isNpc: false,
        team: '',
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
        isStabilized: false,
        conditions: [],
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
      useGameStore.getState().beginOptimisticCharacterEdit('char-1');
      useGameStore.getState().updateCharacter('char-1', { name: 'Optimistic Name' });
      expect(selectCharacterById(useGameStore.getState(), 'char-1')?.name).toBe('Optimistic Name');

      useGameStore.getState().rollbackOptimisticCharacterEdit('char-1');
      expect(selectCharacterById(useGameStore.getState(), 'char-1')?.name).toBe('Test Character');
    });

    it('applyDeathSaveRollResult adds stun save mod to death target', () => {
      const character: Character = {
        id: 'char-1',
        userId: 'user-1',
        sessionId: 'session-1',
        name: 'Test Character',
        type: 'character',
        isNpc: false,
        team: '',
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
        damage: 25,
        isStunned: false,
        isStabilized: false,
        conditions: [],
        combatModifiers: { initiative: 0, stunSave: 1 },
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
      // damage 25 → Mortal 3; base death = BT 8 − 3 = 5; +mod 1 = 6; roll 6 succeeds (not dead)
      useGameStore.getState().applyDeathSaveRollResult('char-1', 6);
      expect(selectCharacterById(useGameStore.getState(), 'char-1')?.damage).toBe(25);
    });
  });
});
