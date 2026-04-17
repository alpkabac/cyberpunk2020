/**
 * Property tests for AI-GM: lorebook, context, tools (Requirements 3.3, 3.6, 4.1–4.3, 16.1).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Character, ChatMessage, Scene } from '../types';
import { createStatBlock } from '../types';
import { buildGmUserContent, sliceRecentChat, formatChatLine } from './context-builder';
import {
  applyGmDamage,
  applyGmDeductMoney,
  recalcCharacterForGm,
} from './character-mutations';
import {
  enforceTokenBudget,
  estimateTokens,
  lookupRulesText,
  matchRules,
  sortByPriority,
  tokenizeForKeywords,
} from './lorebook';
import { loadDefaultLoreRules } from './load-lore-rules';
import { validateGmToolParameters } from './tool-executor';

const minimalScene: Scene = {
  location: 'Night City',
  description: 'Rain',
  npcsPresent: [],
  situation: 'Standoff',
};

const minimalChar = (id: string): Character => ({
  id,
  userId: 'u',
  sessionId: 's',
  name: 'Test',
  type: 'character',
  isNpc: false,
  imageUrl: '',
  role: 'Solo',
  age: 20,
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
});

describe('Property 7: Conversation continuity', () => {
  it('sliceRecentChat keeps order and tail', () => {
    fc.assert(
      fc.property(fc.array(fc.uuid(), { minLength: 0, maxLength: 12 }), fc.integer({ min: 1, max: 20 }), (ids, max) => {
        const msgs: ChatMessage[] = ids.map((id, i) => ({
          id,
          speaker: 'P',
          text: `t${i}`,
          timestamp: i,
          type: 'player',
        }));
        const sliced = sliceRecentChat(msgs, max);
        expect(sliced.length).toBe(Math.min(msgs.length, max));
        if (msgs.length > 0 && max < msgs.length) {
          expect(sliced[0].id).toBe(msgs[msgs.length - max].id);
        }
        for (let i = 1; i < sliced.length; i++) {
          expect(sliced[i].timestamp).toBeGreaterThanOrEqual(sliced[i - 1].timestamp);
        }
      }),
    );
  });

  it('buildGmUserContent includes player line and last chat lines', () => {
    const chars = [minimalChar('c1')];
    const history: ChatMessage[] = [
      { id: '1', speaker: 'A', text: 'one', timestamp: 1, type: 'player' },
      { id: '2', speaker: 'GM', text: 'two', timestamp: 2, type: 'narration' },
    ];
    const out = buildGmUserContent({
      sessionName: 'S',
      sessionSummary: 'sum',
      activeScene: minimalScene,
      characters: chars,
      mapTokens: [],
      chatHistory: history,
      playerMessage: 'I draw my gun',
      messageSpeaker: 'Player',
      loreInjection: 'RULE: test',
      maxHistoryMessages: 10,
    });
    expect(out).toContain('MAP_TOKENS_JSON');
    expect(out).toContain('PLAYER_MESSAGE');
    expect(out).toContain('I draw my gun');
    expect(out).toContain('LORE_RULES');
    expect(out).toContain(formatChatLine(history[history.length - 1]));
  });
});

describe('Property 8: Keyword-based rule injection', () => {
  it('matching uses keywords from player text tokens', () => {
    const rules = loadDefaultLoreRules();
    const m = matchRules('I need to shoot the ganger in combat', rules);
    expect(m.length).toBeGreaterThan(0);
    const ids = new Set(m.map((r) => r.id));
    expect(ids.has('damage-pipeline')).toBe(true);
  });
});

describe('Property 9: Rule priority selection', () => {
  it('sortByPriority orders higher priority first', () => {
    const rules = loadDefaultLoreRules();
    const m = matchRules('damage and armor in combat', rules);
    const sorted = sortByPriority(m);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].priority).toBeGreaterThanOrEqual(sorted[i].priority);
    }
  });
});

describe('Property 10: Token budget enforcement', () => {
  it('enforceTokenBudget never exceeds rough token estimate', () => {
    const rules = loadDefaultLoreRules();
    const m = sortByPriority(matchRules('money combat net', rules));
    fc.assert(
      fc.property(fc.integer({ min: 20, max: 400 }), (budget) => {
        const text = enforceTokenBudget(m, { maxTokens: budget });
        expect(estimateTokens(text)).toBeLessThanOrEqual(budget + 2);
      }),
    );
  });
});

describe('Property 6: Tool parameter validation', () => {
  it('rejects bad apply_damage and deduct_money', () => {
    expect(validateGmToolParameters('apply_damage', { character_id: '', raw_damage: 1 }).ok).toBe(false);
    expect(validateGmToolParameters('apply_damage', { character_id: 'x', raw_damage: -1 }).ok).toBe(false);
    expect(validateGmToolParameters('deduct_money', { character_id: 'x', amount: 1.5 }).ok).toBe(false);
    expect(validateGmToolParameters('deduct_money', { character_id: 'x', amount: -1 }).ok).toBe(false);
  });

  it('accepts valid apply_damage', () => {
    const v = validateGmToolParameters('apply_damage', { character_id: 'abc', raw_damage: 5, location: 'Torso' });
    expect(v.ok).toBe(true);
  });

  it('accepts add_token and remove_token', () => {
    expect(validateGmToolParameters('add_token', { name: 'Ganger' }).ok).toBe(true);
    expect(
      validateGmToolParameters('add_token', {
        name: 'PC',
        controlled_by: 'player',
        character_id: 'c1',
        x: 10,
        y: 20,
      }).ok,
    ).toBe(true);
    expect(validateGmToolParameters('add_token', { name: 'X', controlled_by: 'player' }).ok).toBe(false);
    expect(validateGmToolParameters('remove_token', { token_id: 't1' }).ok).toBe(true);
  });

  it('accepts request_roll (legacy formula and structured roll_kind)', () => {
    expect(validateGmToolParameters('request_roll', { formula: '1d10+5' }).ok).toBe(true);
    expect(
      validateGmToolParameters('request_roll', {
        roll_kind: 'skill',
        character_id: 'c',
        skill_id: 's',
      }).ok,
    ).toBe(true);
    expect(
      validateGmToolParameters('request_roll', {
        roll_kind: 'stat',
        character_id: 'c',
        stat: 'ref',
      }).ok,
    ).toBe(true);
    expect(
      validateGmToolParameters('request_roll', { roll_kind: 'raw_formula', formula: '2d6' }).ok,
    ).toBe(true);
    expect(validateGmToolParameters('request_roll', { roll_kind: 'skill', character_id: 'c' }).ok).toBe(
      false,
    );
  });

  it('accepts spawn_npc with optional fields and stat_overrides', () => {
    expect(validateGmToolParameters('spawn_npc', {}).ok).toBe(true);
    expect(
      validateGmToolParameters('spawn_npc', {
        name: 'Viktor',
        role: 'Fixer',
        threat: 'capable',
        place_token: false,
        announce: true,
        stat_overrides: { ref: 8, cool: 7 },
      }).ok,
    ).toBe(true);
    expect(validateGmToolParameters('spawn_npc', { threat: 'boss' }).ok).toBe(false);
    expect(validateGmToolParameters('spawn_npc', { role: 'Dragon' }).ok).toBe(false);
    expect(validateGmToolParameters('spawn_npc', { place_token: 'yes' }).ok).toBe(false);
    expect(validateGmToolParameters('spawn_npc', { stat_overrides: { ref: 1 } }).ok).toBe(false);
    expect(validateGmToolParameters('spawn_npc', { stat_overrides: { refx: 5 } }).ok).toBe(false);
  });

  it('spawn_random_npc mirrors spawn_npc validation', () => {
    expect(validateGmToolParameters('spawn_random_npc', {}).ok).toBe(true);
    expect(
      validateGmToolParameters('spawn_random_npc', {
        threat: 'elite',
        stat_overrides: { int: 8 },
      }).ok,
    ).toBe(true);
    expect(validateGmToolParameters('spawn_random_npc', { threat: 'boss' }).ok).toBe(false);
  });

  it('accepts spawn_unique_npc with required fields and skills/items', () => {
    expect(
      validateGmToolParameters('spawn_unique_npc', {
        name: 'Adam Smasher',
        role: 'Solo',
        special_ability: { name: 'Combat Sense', value: 10 },
      }).ok,
    ).toBe(true);
    expect(
      validateGmToolParameters('spawn_unique_npc', {
        name: 'X',
        role: 'Fixer',
        special_ability: { name: 'Streetdeal', value: 8 },
        stats: { ref: 10, bt: 12 },
      }).ok,
    ).toBe(false);
    expect(
      validateGmToolParameters('spawn_unique_npc', {
        name: 'X',
        role: 'Fixer',
        special_ability: { name: 'Custom', value: 5 },
        skills: [
          { name: 'Borgware integration', value: 9, linked_stat: 'tech', category: 'Custom' },
        ],
        items: [{ name: 'Malorian', type: 'weapon', damage: '4d6+4', weapon_type: 'Pistol' }],
      }).ok,
    ).toBe(true);
    expect(
      validateGmToolParameters('spawn_unique_npc', {
        name: '',
        role: 'Solo',
        special_ability: { name: 'X', value: 1 },
      }).ok,
    ).toBe(false);
    expect(
      validateGmToolParameters('spawn_unique_npc', {
        name: 'Y',
        role: 'Solo',
        special_ability: { name: '', value: 1 },
      }).ok,
    ).toBe(false);
  });
});

describe('Property 5: Tool execution state changes (pure)', () => {
  it('applyGmDeductMoney reduces eurobucks', () => {
    const c = recalcCharacterForGm(minimalChar('x'));
    const next = applyGmDeductMoney(c, 30);
    expect(next.eurobucks).toBe(70);
  });

  it('applyGmDamage increases damage when given raw damage', () => {
    const c0 = recalcCharacterForGm(minimalChar('x'));
    const next = applyGmDamage(c0, 5, 'Torso', false, false, null);
    expect(next.damage).toBeGreaterThanOrEqual(c0.damage);
  });
});

describe('Property 11: Rule lookup tool', () => {
  it('lookupRulesText returns non-empty for known query', () => {
    const rules = loadDefaultLoreRules();
    const t = lookupRulesText('eurobuck', rules);
    expect(t.length).toBeGreaterThan(0);
  });

  it('lookupRulesText matches long natural-language queries (word hits, not full-string includes)', () => {
    const rules = loadDefaultLoreRules();
    const t = lookupRulesText(
      'Before I roll, refresh me: how does armor SP and BTM interact with damage in Friday Night Firefight?',
      rules,
    );
    expect(t).toContain('damage-pipeline');
    expect(t).not.toMatch(/^\s*$/);
  });

  it('lookupRulesText returns fallback when nothing matches', () => {
    const rules = loadDefaultLoreRules();
    const t = lookupRulesText('zzzzzzzz', rules);
    expect(t).toContain('fallback');
    expect(t.length).toBeGreaterThan(50);
  });
});

describe('Property 31: Tool Call Error Logging (validation surface)', () => {
  it('unknown tool fails validation', () => {
    const v = validateGmToolParameters('not_a_real_tool', {});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('Unknown');
  });

  it('adjust_improvement_points validates delta and reason', () => {
    expect(
      validateGmToolParameters('adjust_improvement_points', {
        character_id: 'c',
        delta: 2,
        reason: 'Survived the extraction',
      }).ok,
    ).toBe(true);
    expect(
      validateGmToolParameters('adjust_improvement_points', {
        character_id: 'c',
        delta: 0,
        reason: 'x',
      }).ok,
    ).toBe(false);
    expect(
      validateGmToolParameters('adjust_improvement_points', {
        character_id: 'c',
        delta: 1,
        reason: '',
      }).ok,
    ).toBe(false);
  });
});

describe('Keyword tokenizer', () => {
  it('tokenizeForKeywords is stable on punctuation', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const t = tokenizeForKeywords(s);
        expect(t.every((w) => /^[a-z0-9]+$/.test(w))).toBe(true);
      }),
    );
  });
});
