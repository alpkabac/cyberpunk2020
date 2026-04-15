'use client';

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  connectSessionRealtime,
  attachSessionRealtimeRecovery,
  fetchSessionSnapshot,
} from '@/lib/realtime';
import { createDefaultPostgresHandlersForGameStore } from '@/lib/realtime/apply-realtime-to-store';
import { useGameStore } from '@/lib/store/game-store';
import type { SessionRealtimeHandle } from '@/lib/realtime/session-channel';

/**
 * Hydrate the game store from Postgres and keep Realtime subscriptions for a session.
 * No-op when `sessionId` or `userId` is missing.
 */
export function useSessionRealtimeSync(
  client: SupabaseClient,
  sessionId: string | null,
  userId: string | undefined,
  onSyncComplete?: () => void,
): void {
  const handleRef = useRef<SessionRealtimeHandle | null>(null);
  const recoveryRef = useRef<(() => void) | null>(null);
  const onDoneRef = useRef(onSyncComplete);
  onDoneRef.current = onSyncComplete;

  useEffect(() => {
    if (!sessionId || !userId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      recoveryRef.current?.();
      recoveryRef.current = null;
      await handleRef.current?.dispose();
      handleRef.current = null;

      const refreshFromDatabase = async () => {
        const snap = await fetchSessionSnapshot(client, sessionId);
        if (snap) {
          useGameStore.getState().hydrateFromLoadedSnapshot(snap);
        }
      };

      try {
        const handle = await connectSessionRealtime(client, {
          sessionId,
          refreshFromDatabase,
          postgresHandlers: createDefaultPostgresHandlersForGameStore(),
        });
        if (cancelled) {
          await handle.dispose();
          return;
        }
        handleRef.current = handle;
        recoveryRef.current = attachSessionRealtimeRecovery(handle);
        onDoneRef.current?.();
      } catch {
        /* connect errors surfaced via Realtime UI elsewhere */
        onDoneRef.current?.();
      }
    };

    void run();

    return () => {
      cancelled = true;
      recoveryRef.current?.();
      recoveryRef.current = null;
      void handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [client, sessionId, userId]);
}
