import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  gmPostBodySchema,
  voiceSttLanguageSchema,
  voiceTurnFragmentBodySchema,
  voiceTurnMergeBodySchema,
} from '@/lib/api/schemas/session-routes';

describe('Property 32: Input validation (session API bodies)', () => {
  it('accepts well-formed GM POST bodies (uuid session, non-empty message)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 400 }).filter((s) => s.trim().length > 0),
        (sessionId, message) => {
        const parsed = gmPostBodySchema.safeParse({
          sessionId,
          playerMessage: message,
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.sessionId).toBe(sessionId);
          expect(parsed.data.playerMessage).toBe(message.trim());
          expect(parsed.data.speakerName).toBe('Player');
        }
      }),
      { numRuns: 80 },
    );
  });

  it('rejects GM bodies with invalid session id', () => {
    const parsed = gmPostBodySchema.safeParse({
      sessionId: 'not-a-uuid',
      playerMessage: 'hello',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts voice merge bodies', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        (sessionId, turnId) => {
          const parsed = voiceTurnMergeBodySchema.safeParse({ sessionId, turnId });
          expect(parsed.success).toBe(true);
          if (parsed.success) {
            expect(parsed.data.turnId).toBe(turnId.trim());
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('accepts voice fragment bodies with optional characterId null', () => {
    const sessionId = fc.uuid();
    const turnId = fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0);
    const userId = fc.uuid();
    const playerMessage = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0);
    const anchorMs = fc.double({ min: -1e6, max: 1e6, noNaN: true });
    fc.assert(
      fc.property(sessionId, turnId, userId, playerMessage, anchorMs, (sid, tid, uid, msg, ams) => {
        const parsed = voiceTurnFragmentBodySchema.safeParse({
          sessionId: sid,
          turnId: tid,
          userId: uid,
          playerMessage: msg,
          anchorMs: ams,
          characterId: null,
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.characterId).toBeNull();
          expect(parsed.data.turnId).toBe(tid.trim());
          expect(parsed.data.playerMessage).toBe(msg.trim());
        }
      }),
      { numRuns: 80 },
    );
  });

  it('rejects fragment bodies with empty playerMessage', () => {
    const parsed = voiceTurnFragmentBodySchema.safeParse({
      sessionId: crypto.randomUUID(),
      turnId: 't1',
      userId: crypto.randomUUID(),
      playerMessage: '   ',
      anchorMs: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('validates BCP-47-ish language tags for voice STT', () => {
    expect(voiceSttLanguageSchema.safeParse('en').success).toBe(true);
    expect(voiceSttLanguageSchema.safeParse('tr').success).toBe(true);
    expect(voiceSttLanguageSchema.safeParse('en-US').success).toBe(true);
    expect(voiceSttLanguageSchema.safeParse('not a lang').success).toBe(false);
  });
});
