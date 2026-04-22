import { describe, expect, it } from 'vitest';
import { plainTextForNarrationTts } from './plain-text-for-tts';

describe('plainTextForNarrationTts', () => {
  it('strips ** and * emphasis', () => {
    expect(plainTextForNarrationTts('**bold** and *italic*')).toBe('bold and italic');
  });

  it('replaces em and en dashes with comma pauses', () => {
    expect(plainTextForNarrationTts('foo—bar')).toBe('foo, bar');
    expect(plainTextForNarrationTts('a–b')).toBe('a, b');
  });

  it('turns line-start 1. into 1,', () => {
    expect(plainTextForNarrationTts('1. Create characters')).toBe('1, Create characters');
    expect(plainTextForNarrationTts('Intro\n\n2. Next step')).toBe('Intro. 2, Next step');
  });

  it('turns colon-prefixed list markers', () => {
    expect(plainTextForNarrationTts('Start: 1. Do this')).toBe('Start: 1, Do this');
  });

  it('strips markdown headings', () => {
    expect(plainTextForNarrationTts('## Heading')).toBe('Heading');
  });

  it('keeps sentence periods; blank lines become a stop so TTS can pause', () => {
    expect(plainTextForNarrationTts('First line.\n\nSecond line.')).toBe('First line. Second line.');
  });

  it('does not strip ellipsis (no space between dots)', () => {
    expect(plainTextForNarrationTts('Wait... then go.')).toBe('Wait... then go.');
  });
});
