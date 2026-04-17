/**
 * Supabase Realtime: `postgres_changes` for session-scoped tables + session channel `broadcast` for ephemeral UX.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Token } from '../types';
import { tokenRowToToken } from './db-mapper';
import { BROADCAST_EVENTS } from './realtime-events';

const CHANNEL_PREFIX = 'session:';

export interface PostgresChangeHandlers {
  onSessionChange?: (row: Record<string, unknown>) => void;
  onCharacterChange?: (args: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    /** Raw Postgres row (may omit unchanged columns on UPDATE). */
    newRow: Record<string, unknown> | null;
    oldRow: Record<string, unknown> | null;
  }) => void;
  onTokenChange?: (args: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    newRecord: Token | null;
    oldRecord: Token | null;
  }) => void;
  onChatMessageChange?: (args: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => void;
}

export interface SessionRealtimeSubscribeOptions {
  sessionId: string;
  /** Load authoritative state from Postgres before (re)subscribing. */
  refreshFromDatabase: () => Promise<void>;
  postgresHandlers?: PostgresChangeHandlers;
  onSubscribeStatus?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void;
  onBroadcast?: (event: string, payload: unknown) => void;
  /**
   * After a Realtime `CHANNEL_ERROR` or `TIMED_OUT`, schedule a full recover (refetch + new channel).
   * Set to `0` to disable. Default `2000` ms debounce.
   */
  recoverOnChannelErrorDebounceMs?: number;
}

export interface SessionRealtimeHandle {
  channel: RealtimeChannel;
  /** Attach websocket listeners (idempotent). Call after `refreshFromDatabase` on first connect. */
  subscribe: () => void;
  unsubscribe: () => Promise<void>;
  sendBroadcast: (event: string, payload: Record<string, unknown>) => Promise<void>;
  /** Full recovery: refetch from DB, tear down channel, subscribe again. */
  recover: () => Promise<void>;
  dispose: () => void;
}

function mapCharacterPayload(payload: {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}, sessionId: string, handlers: PostgresChangeHandlers | undefined) {
  if (!handlers?.onCharacterChange) return;
  const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';

  // For DELETE events Supabase sets payload.new to {} (empty object, not null).
  // Using (payload.new ?? payload.old) picks up that empty object and its missing
  // session_id causes the guard to drop the event. Use payload.old for DELETEs.
  const rowForGuard = eventType === 'DELETE' ? payload.old : (payload.new ?? payload.old);

  // session_id may be absent on DELETE when REPLICA IDENTITY DEFAULT is set
  // (old row only carries the primary key). In that case trust the subscription filter.
  if (rowForGuard && rowForGuard.session_id != null && String(rowForGuard.session_id) !== sessionId) return;

  handlers.onCharacterChange({
    eventType,
    newRow: payload.new as Record<string, unknown> | null,
    oldRow: payload.old as Record<string, unknown> | null,
  });
}

function mapTokenPayload(payload: {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}, sessionId: string, handlers: PostgresChangeHandlers | undefined) {
  if (!handlers?.onTokenChange) return;
  const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';

  const rowForGuard = eventType === 'DELETE' ? payload.old : (payload.new ?? payload.old);
  if (rowForGuard && rowForGuard.session_id != null && String(rowForGuard.session_id) !== sessionId) return;

  const newRecord = payload.new ? tokenRowToToken(payload.new) : null;
  const oldRecord = payload.old ? tokenRowToToken(payload.old) : null;
  handlers.onTokenChange({ eventType, newRecord, oldRecord });
}

function buildChannel(
  client: SupabaseClient,
  sessionId: string,
  handlers: PostgresChangeHandlers | undefined,
  onSubscribeStatus: SessionRealtimeSubscribeOptions['onSubscribeStatus'],
  onBroadcast: SessionRealtimeSubscribeOptions['onBroadcast'],
  scheduleRecoverFromChannelIssue: (() => void) | null,
): RealtimeChannel {
  const filter = `session_id=eq.${sessionId}`;
  const sessionRowFilter = `id=eq.${sessionId}`;
  let ch = client.channel(`${CHANNEL_PREFIX}${sessionId}`, {
    config: { broadcast: { self: true } },
  });

  /**
   * Register `postgres_changes` in the **same order** as `ALTER PUBLICATION supabase_realtime ADD TABLE`
   * (see `migrations/002_enable_realtime_publication.sql`). The join ack returns `postgres_changes[]` in
   * publication order; if client `.on()` order does not match, realtime-js raises `CHANNEL_ERROR`
   * ("mismatch between server and client bindings").
   */
  ch = ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'sessions', filter: sessionRowFilter },
    (payload) => {
      handlers?.onSessionChange?.((payload.new ?? payload.old ?? {}) as Record<string, unknown>);
    },
  );

  ch = ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'characters', filter },
    (payload) => mapCharacterPayload(payload, sessionId, handlers),
  );

  ch = ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'tokens', filter },
    (payload) => mapTokenPayload(payload, sessionId, handlers),
  );

  ch = ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'chat_messages', filter },
    (payload) => {
      handlers?.onChatMessageChange?.({
        eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        new: payload.new as Record<string, unknown> | null,
        old: payload.old as Record<string, unknown> | null,
      });
    },
  );

  for (const eventName of Object.values(BROADCAST_EVENTS)) {
    ch = ch.on('broadcast', { event: eventName }, (msg: { payload?: unknown }) => {
      onBroadcast?.(eventName, msg.payload ?? msg);
    });
  }

  ch.subscribe((status, err) => {
    switch (status) {
      case 'SUBSCRIBED':
        onSubscribeStatus?.('SUBSCRIBED');
        break;
      case 'CHANNEL_ERROR':
        onSubscribeStatus?.('CHANNEL_ERROR');
        if (typeof console !== 'undefined' && err) {
          console.debug('[realtime] CHANNEL_ERROR', err);
        }
        scheduleRecoverFromChannelIssue?.();
        break;
      case 'TIMED_OUT':
        onSubscribeStatus?.('TIMED_OUT');
        scheduleRecoverFromChannelIssue?.();
        break;
      case 'CLOSED':
        onSubscribeStatus?.('CLOSED');
        break;
      default:
        break;
    }
  });

  return ch;
}

/**
 * Create a Realtime subscription: always call `refreshFromDatabase` before the initial `subscribe`.
 * Use `recover()` after tab focus or `online` to refetch and resubscribe.
 */
export function createSessionRealtimeHandle(
  client: SupabaseClient,
  options: SessionRealtimeSubscribeOptions,
): SessionRealtimeHandle {
  let channel: RealtimeChannel | null = null;
  let disposed = false;
  let errorRecoverTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = options.recoverOnChannelErrorDebounceMs ?? 2000;

  const clearRecoverTimer = () => {
    if (errorRecoverTimer) {
      clearTimeout(errorRecoverTimer);
      errorRecoverTimer = null;
    }
  };

  const unsubscribe = async () => {
    if (channel) {
      await client.removeChannel(channel);
      channel = null;
    }
  };

  const recover = async () => {
    clearRecoverTimer();
    await options.refreshFromDatabase();
    await unsubscribe();
    attach();
    subscribe();
  };

  const scheduleRecoverFromChannelIssue =
    debounceMs <= 0
      ? null
      : () => {
          if (disposed) return;
          clearRecoverTimer();
          errorRecoverTimer = setTimeout(() => {
            errorRecoverTimer = null;
            void recover().catch((e) => {
              if (typeof console !== 'undefined') {
                console.warn('[realtime] recover after channel error failed', e);
              }
            });
          }, debounceMs);
        };

  const attach = () => {
    if (disposed) return;
    channel = buildChannel(
      client,
      options.sessionId,
      options.postgresHandlers,
      options.onSubscribeStatus,
      options.onBroadcast,
      scheduleRecoverFromChannelIssue,
    );
  };

  const subscribe = () => {
    if (!channel) attach();
  };

  const sendBroadcast: SessionRealtimeHandle['sendBroadcast'] = async (event, payload) => {
    if (!channel) attach();
    if (!channel) return;
    await channel.send({ type: 'broadcast', event, payload });
  };

  const dispose = () => {
    disposed = true;
    clearRecoverTimer();
    void unsubscribe();
  };

  return {
    get channel() {
      if (!channel) attach();
      return channel!;
    },
    subscribe,
    unsubscribe,
    sendBroadcast,
    recover,
    dispose,
  };
}

/**
 * Loads authoritative Postgres state, then attaches Realtime (correct order for reconnect safety).
 */
export async function connectSessionRealtime(
  client: SupabaseClient,
  options: SessionRealtimeSubscribeOptions,
): Promise<SessionRealtimeHandle> {
  await options.refreshFromDatabase();
  const handle = createSessionRealtimeHandle(client, options);
  handle.subscribe();
  return handle;
}

export function attachSessionRealtimeRecovery(
  handle: SessionRealtimeHandle,
  options: { signalOnlineAndVisible?: boolean; debounceMs?: number } = {},
): () => void {
  const { signalOnlineAndVisible = true, debounceMs = 800 } = options;
  let visibilityTimer: ReturnType<typeof setTimeout> | null = null;

  const onOnline = () => {
    void handle.recover();
  };
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    if (visibilityTimer) clearTimeout(visibilityTimer);
    visibilityTimer = setTimeout(() => {
      visibilityTimer = null;
      void handle.recover();
    }, debounceMs);
  };

  if (signalOnlineAndVisible && typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    if (visibilityTimer) clearTimeout(visibilityTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
