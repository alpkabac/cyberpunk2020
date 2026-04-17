import { describe, expect, it } from 'vitest';
import { parseDeepgramPrerecordedResult } from './parse-deepgram-prerecorded';

describe('parseDeepgramPrerecordedResult', () => {
  it('reads channel transcript when no utterances', () => {
    const raw = {
      results: {
        channels: [{ alternatives: [{ transcript: 'Hello world' }] }],
      },
    };
    const p = parseDeepgramPrerecordedResult(raw);
    expect(p.transcript).toBe('Hello world');
    expect(p.segments).toEqual([{ speaker: 0, text: 'Hello world' }]);
  });

  it('prefers utterances for segments', () => {
    const raw = {
      results: {
        channels: [{ alternatives: [{ transcript: 'Hello world' }] }],
        utterances: [
          { speaker: 0, transcript: 'Hi' },
          { speaker: 1, transcript: 'There' },
        ],
      },
    };
    const p = parseDeepgramPrerecordedResult(raw);
    expect(p.segments).toEqual([
      { speaker: 0, text: 'Hi' },
      { speaker: 1, text: 'There' },
    ]);
    expect(p.transcript).toContain('Hi');
    expect(p.transcript).toContain('There');
  });
});
