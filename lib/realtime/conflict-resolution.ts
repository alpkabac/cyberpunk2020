/**
 * Pure helpers for reconciling optimistic UI state with authoritative Postgres-backed state.
 * Used by property tests (Property 22, 23) and by the realtime sync layer.
 */

import type { Character, ChatMessage, Token } from '../types';

export interface SessionSnapshotSlice {
  characters: Character[];
  tokens: Token[];
  chatMessages: ChatMessage[];
}

/** Authoritative row always wins when a conflict is detected (e.g. concurrent edit). */
export function resolveCharacterConflict(local: Character, authoritative: Character, conflict: boolean): Character {
  return conflict ? authoritative : local;
}

/** After reconnect, hydrated store must contain every entity from the snapshot. */
export function snapshotEntitiesArePresentInHydration(
  snapshot: SessionSnapshotSlice,
  hydratedCharacterIds: Set<string>,
  hydratedTokenIds: Set<string>,
  hydratedChatIds: Set<string>,
): boolean {
  for (const c of snapshot.characters) {
    if (!hydratedCharacterIds.has(c.id)) return false;
  }
  for (const t of snapshot.tokens) {
    if (!hydratedTokenIds.has(t.id)) return false;
  }
  for (const m of snapshot.chatMessages) {
    if (!hydratedChatIds.has(m.id)) return false;
  }
  return true;
}

/** Build ID sets from hydrated collections (for Property 22 checks). */
export function idsFromCharacters(chars: Character[]): Set<string> {
  return new Set(chars.map((c) => c.id));
}

export function idsFromTokens(tokens: Token[]): Set<string> {
  return new Set(tokens.map((t) => t.id));
}

export function idsFromChat(messages: ChatMessage[]): Set<string> {
  return new Set(messages.map((m) => m.id));
}
