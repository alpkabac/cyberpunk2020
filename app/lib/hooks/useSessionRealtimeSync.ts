'use client';

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  connectSessionRealtime,
  attachSessionRealtimeRecovery,
  fetchSessionSnapshot,
} from '@/lib/realtime';
import { createDefaultPostgresHandlersForGameStore } from '@/lib/realtime/apply-realtime-to-store';
import { reportClientError } from '@/lib/logging/client-report';
import { BROADCAST_EVENTS } from '@/lib/realtime/realtime-events';
import { useGameStore } from '@/lib/store/game-store';
import type { SessionRealtimeHandle } from '@/lib/realtime/session-channel';

const CONNECT_RETRY_MAX = 4;

function connectRetryDelayMs(attempt: number): number {
  return 600 * Math.pow(2, attempt);
}

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
  useEffect(() => {
    onDoneRef.current = onSyncComplete;
  });

  useEffect(() => {
    if (!sessionId || !userId) {
      return;
    }

    let cancelled = false;
    let connectAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

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
          onBroadcast: (event, payload) => {
            if (event === BROADCAST_EVENTS.SESSION_RECORDING) {
              useGameStore.getState().applySessionRecordingBroadcast(payload);
            } else if (event === BROADCAST_EVENTS.SESSION_VOICE_STOP_ALL) {
              useGameStore.getState().bumpSessionVoiceStopAllFromBroadcast(payload);
            } else if (event === BROADCAST_EVENTS.SESSION_VOICE_PEER_START) {
              useGameStore.getState().bumpSessionVoicePeerStartFromBroadcast();
            }
          },
        });
        connectAttempt = 0;
        if (cancelled) {
          await handle.dispose();
          return;
        }
        handleRef.current = handle;
        useGameStore.getState().registerSessionBroadcastSend(handle.sendBroadcast.bind(handle));
        recoveryRef.current = attachSessionRealtimeRecovery(handle);
        onDoneRef.current?.();
      } catch (e) {
        reportClientError('session-realtime:connect-failed', e, {
          sessionId,
          attempt: connectAttempt,
        });
        if (!cancelled && connectAttempt < CONNECT_RETRY_MAX - 1) {
          connectAttempt += 1;
          const delay = connectRetryDelayMs(connectAttempt - 1);
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void run();
          }, delay);
        } else {
          onDoneRef.current?.();
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      useGameStore.getState().registerSessionBroadcastSend(null);
      recoveryRef.current?.();
      recoveryRef.current = null;
      void handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [client, sessionId, userId]);
}
