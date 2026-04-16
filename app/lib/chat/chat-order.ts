import type { ChatMessage } from '@/lib/types';

/**
 * Returns a copy of messages sorted by timestamp ascending (chronological).
 * Used for display and for ordering invariants (Property 24).
 */
export function sortChatMessagesByTimestamp(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}
