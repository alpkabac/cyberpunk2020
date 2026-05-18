import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chatMessagePostBodySchema } from '@/lib/api/schemas/session-routes';

describe('Property 32: Input validation (session API bodies)', () => {
  it('accepts well-formed manual chat messages', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 400 }).filter((s) => s.trim().length > 0),
        fc.constantFrom('player', 'narration', 'roll'),
        (sessionId, text, type) => {
          const parsed = chatMessagePostBodySchema.safeParse({
            sessionId,
            text,
            speaker: 'Player',
            type,
          });
          expect(parsed.success).toBe(true);
          if (parsed.success) {
            expect(parsed.data.sessionId).toBe(sessionId);
            expect(parsed.data.text).toBe(text.trim());
            expect(parsed.data.type).toBe(type);
          }
        },
      ),
      { numRuns: 80 },
    );
  });

  it('rejects invalid manual chat session ids', () => {
    const parsed = chatMessagePostBodySchema.safeParse({
      sessionId: 'not-a-uuid',
      text: 'hello',
      type: 'player',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects empty manual chat text', () => {
    const parsed = chatMessagePostBodySchema.safeParse({
      sessionId: crypto.randomUUID(),
      text: '   ',
      type: 'player',
    });
    expect(parsed.success).toBe(false);
  });
});
