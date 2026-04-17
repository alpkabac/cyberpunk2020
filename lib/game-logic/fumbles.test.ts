import { describe, it, expect } from 'vitest';
import { pickReflexCombatFumbleRow } from './lookups';

describe('pickReflexCombatFumbleRow', () => {
  it('maps d10 to Foundry-style reflex combat bands', () => {
    expect(pickReflexCombatFumbleRow(1).max).toBe(4);
    expect(pickReflexCombatFumbleRow(4).min).toBe(1);
    expect(pickReflexCombatFumbleRow(5).description.toLowerCase()).toContain('drop');
    expect(pickReflexCombatFumbleRow(6).needsReliability).toBe('discharge');
    expect(pickReflexCombatFumbleRow(7).needsReliability).toBe('jam');
    expect(pickReflexCombatFumbleRow(8).needsLocation).toBe(true);
    expect(pickReflexCombatFumbleRow(10).needsLocation).toBe(true);
  });
});
