/**
 * Property 24: Session History Ordering (Requirements 11.5)
 * For any list of chat messages, sorting by timestamp yields non-decreasing chronological order.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ChatMessage } from '@/lib/types';
import { sortChatMessagesByTimestamp } from './chat-order';

const arbChatMessage = fc.record({
  id: fc.uuid(),
  speaker: fc.string({ minLength: 1, maxLength: 24 }),
  text: fc.string({ maxLength: 200 }),
  timestamp: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  type: fc.constantFrom('narration', 'player', 'system', 'roll') as fc.Arbitrary<ChatMessage['type']>,
});

describe('Property 24: Session History Ordering', () => {
  it('sortChatMessagesByTimestamp yields non-decreasing timestamps', () => {
    fc.assert(
      fc.property(fc.array(arbChatMessage, { maxLength: 40 }), (rows) => {
        const messages: ChatMessage[] = rows.map((r) => ({
          id: r.id,
          speaker: r.speaker,
          text: r.text,
          timestamp: r.timestamp,
          type: r.type,
        }));
        const sorted = sortChatMessagesByTimestamp(messages);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].timestamp).toBeGreaterThanOrEqual(sorted[i - 1].timestamp);
        }
      }),
      { numRuns: 100 },
    );
  });
});
