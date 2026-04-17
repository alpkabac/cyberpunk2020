import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseBearerToken } from '@/lib/auth/bearer';

describe('Property 28: Authentication header parsing (Bearer enforcement)', () => {
  it('rejects missing, wrong scheme, or empty token', () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken('')).toBeNull();
    expect(parseBearerToken('Basic xyz')).toBeNull();
    expect(parseBearerToken('Bearer')).toBeNull();
    expect(parseBearerToken('Bearer ')).toBeNull();
    expect(parseBearerToken('Bearer  ')).toBeNull();
  });

  it('accepts Bearer + non-empty single-line token (case-insensitive scheme)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !/\s/.test(s)),
        (token) => parseBearerToken(`Bearer ${token}`) === token,
      ),
      { numRuns: 60 },
    );
  });

  it('trims outer whitespace on the header line', () => {
    expect(parseBearerToken('  Bearer abc  ')).toBe('abc');
  });
});
