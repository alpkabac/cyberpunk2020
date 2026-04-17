import { useGameStore } from '@/lib/store/game-store';
import type { ChatMessage } from '@/lib/types';

/** Successful JSON from POST `/api/gm` after player row is saved (fast response). */
export interface GmPostSuccessBody {
  ok?: boolean;
  narrationPending?: boolean;
  playerMessage?: ChatMessage;
}

/**
 * Adds the saved player row to local chat immediately so the UI updates before Realtime
 * (and dedupes when the same row arrives over the wire).
 */
export function applyGmPostSuccessToStore(data: unknown): void {
  const body = data as GmPostSuccessBody;
  const pm = body?.playerMessage;
  if (pm && typeof pm.id === 'string' && pm.text) {
    useGameStore.getState().addChatMessage(pm);
  }
  if (body?.narrationPending) {
    useGameStore.getState().setGmNarrationPending(true);
  }
}
