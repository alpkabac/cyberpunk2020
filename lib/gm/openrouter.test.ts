import { describe, expect, it } from 'vitest';
import type { OpenRouterToolCall } from './context-builder';
import { sortGmToolCallsForExecution } from './openrouter';

function tc(name: string, id: string): OpenRouterToolCall {
  return { id, type: 'function', function: { name, arguments: '{}' } };
}

describe('sortGmToolCallsForExecution', () => {
  it('places spawn tools before start_combat and preserves spawn order', () => {
    const ordered = sortGmToolCallsForExecution([
      tc('start_combat', 'a'),
      tc('spawn_unique_npc', 'b'),
      tc('roll_dice', 'c'),
      tc('spawn_random_npc', 'd'),
    ]);
    expect(ordered.map((x) => x.function.name)).toEqual([
      'spawn_unique_npc',
      'spawn_random_npc',
      'roll_dice',
      'start_combat',
    ]);
  });

  it('leaves non-spawn batches unchanged relative order when no start_combat', () => {
    const ordered = sortGmToolCallsForExecution([tc('roll_dice', '1'), tc('apply_damage', '2')]);
    expect(ordered.map((x) => x.function.name)).toEqual(['roll_dice', 'apply_damage']);
  });

  it('runs next_turn after ordinary tools and end_combat after next_turn', () => {
    const ordered = sortGmToolCallsForExecution([
      tc('next_turn', 'a'),
      tc('apply_damage', 'b'),
      tc('end_combat', 'c'),
    ]);
    expect(ordered.map((x) => x.function.name)).toEqual(['apply_damage', 'next_turn', 'end_combat']);
  });
});
