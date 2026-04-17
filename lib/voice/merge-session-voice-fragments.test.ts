import { describe, expect, it } from 'vitest';
import { mergeSessionVoiceTurnFragmentsForGm } from './merge-session-voice-fragments';

describe('mergeSessionVoiceTurnFragmentsForGm', () => {
  it('orders voice and rolls by timestamp across fragments', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 5);
    const t1 = Date.UTC(2026, 0, 1, 12, 0, 10);
    const t2 = Date.UTC(2026, 0, 1, 12, 0, 7);

    const { playerMessage, playerMessageMetadata } = mergeSessionVoiceTurnFragmentsForGm([
      {
        anchorMs: t1,
        playerMessage: '[character:a] [A] second',
        pendingRolls: [{ rolledAtMs: t0, playerMessage: 'roll early' }],
      },
      {
        anchorMs: t2,
        playerMessage: '[character:b] [B] middle',
        pendingRolls: [],
      },
    ]);

    expect(playerMessageMetadata.mergedSessionVoice).toBe(true);
    expect(playerMessage).toContain('Roll');
    expect(playerMessage.indexOf('roll early')).toBeLessThan(playerMessage.indexOf('[character:b]'));
    expect(playerMessage.indexOf('[character:b]')).toBeLessThan(playerMessage.indexOf('[character:a]'));
  });
});
