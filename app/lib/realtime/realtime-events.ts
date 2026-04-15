/**
 * Realtime event routing: durable Postgres-backed updates vs ephemeral broadcast.
 *
 * Durable (source of truth in Postgres; clients reconcile from `postgres_changes` + refetch):
 * - characters, tokens, chat_messages, sessions (session row: map, scene, settings, summary)
 *
 * Ephemeral (session channel `broadcast` only — not stored, safe to lose on disconnect):
 * - roll_request (suggested formula / UX hints)
 * - typing (chat composition)
 * - token_drag_preview (optional smooth drag before commit)
 * - presence_ping (optional heartbeat; use Presence API if you need member lists)
 *
 * Never duplicate the same semantic update on both postgres_changes and broadcast for the same
 * user-visible field, or clients may apply it twice or fight over source of truth.
 */

/** Broadcast event names (use with `RealtimeChannel.send` type `broadcast`). */
export const BROADCAST_EVENTS = {
  ROLL_REQUEST: 'roll_request',
  TYPING: 'typing',
  TOKEN_DRAG_PREVIEW: 'token_drag_preview',
} as const;

export type BroadcastEventName = (typeof BROADCAST_EVENTS)[keyof typeof BROADCAST_EVENTS];
