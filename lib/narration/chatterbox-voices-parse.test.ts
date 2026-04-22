import { describe, it, expect } from 'vitest';
import {
  normalizeChatterboxFileEntry,
  parseChatterboxVoicesPayload,
  parseChatterboxReferencePayload,
} from './chatterbox-voices-parse';

describe('chatterbox-voices-parse', () => {
  it('extracts filename from object entries (not [object Object])', () => {
    expect(normalizeChatterboxFileEntry({ filename: 'a.wav' })).toBe('a.wav');
    expect(normalizeChatterboxFileEntry({ name: 'b.mp3' })).toBe('b.mp3');
    expect(normalizeChatterboxFileEntry({})).toBe(null);
  });

  it('parses array of objects from predefined voices API', () => {
    const raw = [{ filename: 'v1.wav' }, { filename: 'v2.wav' }];
    expect(parseChatterboxVoicesPayload(raw)).toEqual(['v1.wav', 'v2.wav']);
  });

  it('parses reference_files array', () => {
    const raw = { reference_files: [{ filename: 'ref1.wav' }, { name: 'ref2.mp3' }] };
    expect(parseChatterboxReferencePayload(raw)).toEqual(['ref1.wav', 'ref2.mp3']);
  });
});
