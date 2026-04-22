import { describe, expect, it } from 'vitest';
import { buildChatterboxNarrationSegments, matchChatterboxNpcVoiceRule } from './chatterbox-npc-narration-segments';
import type { ChatterboxNpcVoiceRule } from './narration-tts-client-config';

const R: ChatterboxNpcVoiceRule[] = [
  { label: 'Bartender', voiceMode: 'predefined', predefinedVoiceId: 'a.wav' },
  { label: 'Fixer', voiceMode: 'predefined', predefinedVoiceId: 'b.wav' },
];

const ORDER_SLOTS: ChatterboxNpcVoiceRule[] = [
  { voiceMode: 'predefined', predefinedVoiceId: 'a.wav' },
  { voiceMode: 'predefined', predefinedVoiceId: 'b.wav' },
];

describe('matchChatterboxNpcVoiceRule', () => {
  it('matches longest label first', () => {
    const rules: ChatterboxNpcVoiceRule[] = [
      { label: 'Bart', voiceMode: 'predefined', predefinedVoiceId: 'x.wav' },
      { label: 'Bartender', voiceMode: 'predefined', predefinedVoiceId: 'y.wav' },
    ];
    const m = matchChatterboxNpcVoiceRule('The Bartender', rules);
    expect(m?.predefinedVoiceId).toBe('y.wav');
  });

  it('requires 3+ chars for fuzzy', () => {
    const rules: ChatterboxNpcVoiceRule[] = [{ label: 'Al', voiceMode: 'predefined', predefinedVoiceId: 'z.wav' }];
    expect(matchChatterboxNpcVoiceRule('Alice', rules)).toBeNull();
    expect(matchChatterboxNpcVoiceRule('Al', rules)?.predefinedVoiceId).toBe('z.wav');
  });
});

describe('buildChatterboxNarrationSegments', () => {
  it('uses speaker when not Game Master', () => {
    const { segments: segs } = buildChatterboxNarrationSegments('Hello there', 'Bartender', R);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.text).toBe('Hello there');
    expect(segs[0]!.rule?.predefinedVoiceId).toBe('a.wav');
  });

  it('ignores Game Master for whole-message', () => {
    const { segments: segs } = buildChatterboxNarrationSegments('Line one.\nBartender: Get out.', 'Game Master', R);
    expect(segs.length).toBeGreaterThan(1);
    const withVoice = segs.find((s) => s.rule?.label === 'Bartender');
    expect(withVoice).toBeDefined();
  });

  it('splits by dialogue labels in body', () => {
    const t = 'Rain hits chrome.\nBartender: You lost?\nA beat.\nFixer: Maybe.';
    const { segments: segs } = buildChatterboxNarrationSegments(t, 'Game Master', R);
    expect(segs[0]!.rule).toBeNull();
    expect(segs[1]!.rule?.label).toBe('Bartender');
    expect(segs[2]!.rule?.label).toBe('Fixer');
  });

  it('byListOrder: non-GM message uses first list row (names irrelevant)', () => {
    const { segments: segs } = buildChatterboxNarrationSegments('Hello', 'Random NPC', ORDER_SLOTS, 'byListOrder');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.rule?.predefinedVoiceId).toBe('a.wav');
  });

  it('byListOrder: 1st new label row = slot 0, 2nd = slot 1, 3rd wraps', () => {
    const t = 'Stranger: one\nOther: two\nThird: three';
    const { segments: segs } = buildChatterboxNarrationSegments(t, 'Game Master', ORDER_SLOTS, 'byListOrder');
    expect(segs[0]!.rule?.predefinedVoiceId).toBe('a.wav');
    expect(segs[1]!.rule?.predefinedVoiceId).toBe('b.wav');
    expect(segs[2]!.rule?.predefinedVoiceId).toBe('a.wav');
  });

  it('byListOrder: same name later reuses the same slot (adjacent same voice merges for one TTS call)', () => {
    const t = 'Stranger: a\nline\nStranger: b';
    const { segments: segs } = buildChatterboxNarrationSegments(t, 'Game Master', ORDER_SLOTS, 'byListOrder');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.text).toContain('Stranger: a');
    expect(segs[0]!.text).toContain('Stranger: b');
    expect(segs[0]!.rule?.predefinedVoiceId).toBe('a.wav');
  });

  it('byListOrder: voiceMemory carries across messages for the same normalized name', () => {
    const first = buildChatterboxNarrationSegments(
      'Stranger: first line',
      'Game Master',
      ORDER_SLOTS,
      'byListOrder',
      {},
    );
    expect(first.voiceMemory.stranger).toBe(0);
    expect(first.segments[0]!.rule?.predefinedVoiceId).toBe('a.wav');

    const second = buildChatterboxNarrationSegments(
      'Stranger: later post',
      'Game Master',
      ORDER_SLOTS,
      'byListOrder',
      first.voiceMemory,
    );
    expect(second.voiceMemory.stranger).toBe(0);
    expect(second.segments[0]!.rule?.predefinedVoiceId).toBe('a.wav');
    expect(Object.keys(second.voiceMemory)).toEqual(['stranger']);
  });
});
