import type { ChatMessage } from '@/lib/types';

function sortChatStable(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export function orderedChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return sortChatStable(messages);
}

/** Inclusive tail slice from `fromMessageId` in chronological order, or null if id missing. */
export function sliceFromMessageInclusive(
  messages: ChatMessage[],
  fromMessageId: string,
): ChatMessage[] | null {
  const sorted = sortChatStable(messages);
  const i = sorted.findIndex((m) => m.id === fromMessageId);
  if (i === -1) return null;
  return sorted.slice(i);
}

export function findLastPlayerBeforeIndex(sorted: ChatMessage[], index: number): ChatMessage | null {
  for (let j = index - 1; j >= 0; j--) {
    if (sorted[j].type === 'player') return sorted[j];
  }
  return null;
}

export function indexOfMessageId(sorted: ChatMessage[], messageId: string): number {
  return sorted.findIndex((m) => m.id === messageId);
}
