import { describe, expect, it } from 'vitest';
import { parseSessionSettingsJson } from './db-mapper';

describe('parseSessionSettingsJson', () => {
  it('ignores legacy AI, STT, and TTS settings fields', () => {
    const settings = parseSessionSettingsJson({
      autoRollDamage: false,
      allowPlayerTokenMovement: true,
      ttsEnabled: true,
      narrationTts: { provider: 'omnivoice' },
      voiceInputMode: 'session',
      sttLanguage: 'tr',
      aiLanguage: 'tr',
      gmOpenRouterModel: 'some/model',
    });

    expect(settings.autoRollDamage).toBe(false);
    expect(settings.allowPlayerTokenMovement).toBe(true);
    expect(settings).not.toHaveProperty('ttsEnabled');
    expect(settings).not.toHaveProperty('narrationTts');
    expect(settings).not.toHaveProperty('voiceInputMode');
    expect(settings).not.toHaveProperty('sttLanguage');
    expect(settings).not.toHaveProperty('aiLanguage');
    expect(settings).not.toHaveProperty('gmOpenRouterModel');
  });
});
