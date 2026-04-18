import { describe, it, expect } from 'vitest';
import { sanitizeGmNarrationText } from './sanitize-gm-narration';

describe('sanitizeGmNarrationText', () => {
  it('removes closed function_calls blocks', () => {
    const raw =
      'The shot rings out.\n\n<function_calls>\n<invoke name="roll_dice">\n</invoke>\n</function_calls>';
    expect(sanitizeGmNarrationText(raw)).toBe('The shot rings out.');
  });

  it('removes invoke blocks outside function_calls', () => {
    expect(sanitizeGmNarrationText('Hit.\n<invoke name="x">y</invoke>\nDone.')).toBe('Hit.\n\nDone.');
  });

  it('truncates unclosed function_calls to end of string', () => {
    expect(sanitizeGmNarrationText('Start\n<function_calls>\n<invoke')).toBe('Start');
  });

  it('preserves normal prose', () => {
    const s = '**Mekanik:** 2d6+3 → 9';
    expect(sanitizeGmNarrationText(s)).toBe(s);
  });
});
