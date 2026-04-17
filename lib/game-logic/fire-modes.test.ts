import { describe, expect, it } from 'vitest';
import {
  burstAllowedAtBracket,
  burstAmmo,
  burstHitCountFromD6,
  fullAutoHitCount,
  fullAutoRoundsPerTarget,
  fullAutoToHitModifier,
  getAmmoConsumed,
  stripAutofireIncompatibleMods,
} from './fire-modes';

describe('fire-modes', () => {
  it('burst ammo uses min(3, ROF)', () => {
    expect(burstAmmo(2)).toBe(2);
    expect(burstAmmo(3)).toBe(3);
    expect(burstAmmo(35)).toBe(3);
    expect(getAmmoConsumed('ThreeRoundBurst', 2)).toBe(2);
    expect(getAmmoConsumed('ThreeRoundBurst', 20)).toBe(3);
  });

  it('burst only at Close or Medium', () => {
    expect(burstAllowedAtBracket('Close')).toBe(true);
    expect(burstAllowedAtBracket('Medium')).toBe(true);
    expect(burstAllowedAtBracket('PointBlank')).toBe(false);
    expect(burstAllowedAtBracket('Long')).toBe(false);
  });

  it('full auto rounds per target', () => {
    expect(fullAutoRoundsPerTarget(20, 3)).toBe(6);
    expect(fullAutoRoundsPerTarget(20, 1)).toBe(20);
    expect(fullAutoRoundsPerTarget(7, 3)).toBe(2);
  });

  it('full auto to-hit modifier', () => {
    expect(fullAutoToHitModifier(20, 'Close')).toBe(2);
    expect(fullAutoToHitModifier(20, 'Long')).toBe(-2);
    expect(fullAutoToHitModifier(5, 'Medium')).toBe(0);
  });

  it('full auto hit count', () => {
    expect(fullAutoHitCount(22, 20, 6)).toBe(2);
    expect(fullAutoHitCount(19, 20, 6)).toBe(0);
    expect(fullAutoHitCount(30, 20, 6)).toBe(6);
  });

  it('burst hits from d6', () => {
    expect(burstHitCountFromD6(1)).toBe(0);
    expect(burstHitCountFromD6(2)).toBe(1);
    expect(burstHitCountFromD6(6)).toBe(3);
  });

  it('strip autofire incompatible mods', () => {
    const modValues: Record<string, number> = { 'Aiming (3 rounds, max)': 3, Smartgun: 2 };
    expect(
      stripAutofireIncompatibleMods(
        { 'Aiming (3 rounds, max)': true, Smartgun: true },
        modValues,
      ),
    ).toBe(-5);
    expect(stripAutofireIncompatibleMods({}, modValues)).toBe(0);
  });
});
