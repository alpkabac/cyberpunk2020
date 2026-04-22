import { describe, expect, it } from 'vitest';
import { concatWavBuffers, splitTextForOmnivoiceChunks } from './concat-wav-buffers';

describe('splitTextForOmnivoiceChunks', () => {
  it('returns single part when under limit', () => {
    expect(splitTextForOmnivoiceChunks('short', 100)).toEqual(['short']);
  });
  it('splits long text on boundaries', () => {
    const a = 'x'.repeat(2000);
    const b = 'y'.repeat(2000);
    const t = `${a}.\n\n${b}`;
    const parts = splitTextForOmnivoiceChunks(t, 1600);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(1700);
    }
  });
});

describe('concatWavBuffers', () => {
  it('returns single buffer unchanged', () => {
    const b = Buffer.from('RIFFxxxxWAVE', 'ascii');
    expect(concatWavBuffers([b]).equals(b)).toBe(true);
  });
});
