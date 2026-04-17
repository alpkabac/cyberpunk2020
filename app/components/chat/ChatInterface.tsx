'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { sortChatMessagesByTimestamp } from '@/lib/chat/chat-order';
import type { ChatMessage } from '@/lib/types';
import {
  resolveGmRequestRoll,
  rollRequestMetadataToInput,
} from '@/lib/game-logic/resolve-gm-request-roll';
import { useVoiceRecorder } from '@/lib/hooks/useVoiceRecorder';
import { applyGmPostSuccessToStore } from '@/lib/gm/apply-gm-client-response';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { voiceBlobToGmPlayerMessage } from '@/lib/voice/voice-blob-to-player-message';
import { requestSessionVoiceTurnMerge } from '@/lib/voice/request-session-voice-turn-merge';
import { supabase } from '@/lib/supabase';
import { persistSessionVoiceSettings } from '@/lib/session/persist-session-voice-settings';

function typeLabel(type: ChatMessage['type'], meta?: Record<string, unknown>): string {
  if (type === 'system' && meta?.kind === 'roll_request') return 'ROLL';
  switch (type) {
    case 'narration':
      return 'GM';
    case 'player':
      return 'PLAYER';
    case 'system':
      return 'SYS';
    case 'roll':
      return 'DICE';
  }
}

function bubbleClasses(type: ChatMessage['type'], meta?: Record<string, unknown>): string {
  if (type === 'system' && meta?.kind === 'roll_request') {
    return 'border-l-amber-400 bg-amber-950/50 text-amber-50';
  }
  switch (type) {
    case 'narration':
      return 'border-l-violet-400 bg-violet-950/40 text-violet-50';
    case 'player':
      return 'border-l-cyan-500 bg-cyan-950/30 text-cyan-50';
    case 'system':
      return 'border-l-zinc-500 bg-zinc-900/70 text-zinc-200';
    case 'roll':
      return 'border-l-emerald-500 bg-emerald-950/35 text-emerald-50';
  }
}

export interface ChatInterfaceProps {
  sessionId: string;
  /** Shown as chat speaker for player messages and roll replies (e.g. character name). */
  speakerName: string;
  /** When false, input is disabled (e.g. not signed in). */
  enabled?: boolean;
  /** Selected character id — used when GM omits character_id on the request. */
  focusCharacterId?: string | null;
}

export function ChatInterface({
  sessionId,
  speakerName,
  enabled = true,
  focusCharacterId = null,
}: ChatInterfaceProps) {
  const rawMessages = useGameStore((s) => s.chat.messages);
  const isLoading = useGameStore((s) => s.chat.isLoading);
  const setChatLoading = useGameStore((s) => s.setChatLoading);
  const openDiceRoller = useGameStore((s) => s.openDiceRoller);
  const voiceInputMode = useGameStore((s) => s.ui.voiceInputMode);
  const sessionRecordingGroupActive = useGameStore((s) => s.ui.sessionRecordingGroupActive);
  const sessionRecordingStartedBy = useGameStore((s) => s.ui.sessionRecordingStartedBy);
  const applySessionRecordingBroadcast = useGameStore((s) => s.applySessionRecordingBroadcast);
  const broadcastSessionRecordingState = useGameStore((s) => s.broadcastSessionRecordingState);
  const broadcastSessionVoiceStopAll = useGameStore((s) => s.broadcastSessionVoiceStopAll);
  const broadcastSessionVoicePeerStart = useGameStore((s) => s.broadcastSessionVoicePeerStart);
  const sessionVoiceStopAllTick = useGameStore((s) => s.ui.sessionVoiceStopAllTick);
  const sessionVoiceStopTurnId = useGameStore((s) => s.ui.sessionVoiceStopTurnId);
  const sessionVoicePeerStartTick = useGameStore((s) => s.ui.sessionVoicePeerStartTick);
  const clearPendingVoiceGm = useGameStore((s) => s.clearPendingVoiceGm);
  const pendingRollsForVoice = useGameStore((s) => s.ui.pendingRollsForVoice);
  const removePendingRollForVoice = useGameStore((s) => s.removePendingRollForVoice);
  const clearPendingRollsForVoice = useGameStore((s) => s.clearPendingRollsForVoice);
  const gmNarrationPending = useGameStore((s) => s.ui.gmNarrationPending);
  const setVoiceRecordingStore = useGameStore((s) => s.setVoiceRecording);
  const charactersById = useGameStore((s) => s.characters.byId);
  const npcsById = useGameStore((s) => s.npcs.byId);
  const includeSpecialAbilityInSkillRolls = useGameStore((s) => s.ui.includeSpecialAbilityInSkillRolls);

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const {
    isRecording: voiceRecording,
    micReady,
    error: voiceHookError,
    acquireMic,
    releaseMic,
    start: startVoice,
    stop: stopVoice,
    stopDiscard,
  } = useVoiceRecorder();
  /** Mirrors `voiceRecording` so tick handlers read the latest value in the same render (avoids stale "still recording"). */
  const voiceRecordingRef = useRef(voiceRecording);
  voiceRecordingRef.current = voiceRecording;

  /** Session mode: wall-clock when recording started (chronological merge with saved rolls). */
  const sessionRecordingStartMsRef = useRef<number | null>(null);
  /** True when the current take was started while Session mode was on (vs push-to-talk). */
  const recordingStartedInSessionModeRef = useRef(false);
  /** Last processed `sessionVoicePeerStartTick` so we don't re-run when `voiceRecording` flips to false. */
  const lastConsumedPeerStartTickRef = useRef(0);
  /** Last `sessionVoiceStopAllTick` we applied (each increment is handled once for all clients). */
  const lastHandledStopAllTickRef = useRef(0);
  /** Skip mirroring the peer tick that echoes from our own Session Mic press (avoids double `startVoice` + stuck recorder). */
  const ignoreNextPeerStartForLocalMicRef = useRef(false);
  const messages = useMemo(() => sortChatMessagesByTimestamp(rawMessages), [rawMessages]);
  const lastMessageId = useMemo(
    () => (messages.length > 0 ? messages[messages.length - 1]?.id : undefined),
    [messages],
  );

  const submitSessionVoiceFragment = useCallback(
    async (turnId: string, blob: Blob, recordingStartedAtMs: number | undefined) => {
      setVoiceError(null);
      setChatLoading(true);
      try {
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();
        const userId = authSession?.user?.id;
        const accessToken = authSession?.access_token;
        if (!userId || !accessToken) {
          setVoiceError('Not signed in');
          return;
        }
        const textResult = await voiceBlobToGmPlayerMessage({
          blob,
          focusCharacterId,
          speakerName,
          charactersById,
          npcsById,
          accessToken,
        });
        if (!textResult.ok) {
          setVoiceError(textResult.error);
          return;
        }
        const rolls = useGameStore.getState().ui.pendingRollsForVoice.filter((r) => r.sessionId === sessionId);
        const pendingRollsForJson = rolls.map((r) => ({ rolledAtMs: r.rolledAtMs, playerMessage: r.playerMessage }));
        const res = await fetch('/api/session/voice-turn/fragment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            sessionId,
            turnId,
            userId,
            speakerName,
            characterId: focusCharacterId,
            playerMessage: textResult.playerMessage,
            playerMessageMetadata: textResult.playerMessageMetadata,
            anchorMs: recordingStartedAtMs ?? Date.now(),
            pendingRolls: pendingRollsForJson,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setVoiceError((j as { error?: string }).error ?? res.statusText ?? 'Failed to save voice fragment');
          return;
        }
        useGameStore.getState().clearPendingRollsForSession(sessionId);
        await requestSessionVoiceTurnMerge(sessionId, turnId, accessToken);
      } catch (e) {
        setVoiceError(e instanceof Error ? e.message : String(e));
      } finally {
        setChatLoading(false);
      }
    },
    [
      sessionId,
      focusCharacterId,
      speakerName,
      charactersById,
      npcsById,
      setChatLoading,
    ],
  );

  const endRef = useRef<HTMLDivElement>(null);
  /** After load/refresh, skip auto-opening the dice UI for the latest roll already in history; only open for new roll requests. */
  const rollAutoOpenPrimedRef = useRef(false);
  const lastSeenRollRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    rollAutoOpenPrimedRef.current = false;
    lastSeenRollRequestIdRef.current = null;
    lastConsumedPeerStartTickRef.current = 0;
    lastHandledStopAllTickRef.current = 0;
    ignoreNextPeerStartForLocalMicRef.current = false;
    useGameStore.getState().clearPendingRollsForVoice();
  }, [sessionId]);

  useEffect(() => {
    releaseMic();
  }, [sessionId, releaseMic]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMessageId, pendingRollsForVoice.length]);

  const lastRollRequest = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === 'system' && m.metadata?.kind === 'roll_request') return m;
    }
    return null;
  }, [messages]);

  const openGmRollFromMessage = useCallback(
    (m: ChatMessage) => {
      const meta = m.metadata as Record<string, unknown> | undefined;
      if (!meta) return;
      const input = rollRequestMetadataToInput(meta);
      const cid =
        (typeof meta.characterId === 'string' && meta.characterId) || focusCharacterId || null;
      const char = cid ? charactersById[cid] ?? npcsById[cid] : null;
      const r = resolveGmRequestRoll(char, input, {
        includeSpecialAbilityInSkillRolls,
      });
      const formula = r.formula.trim();
      if (!formula) return;
      const reason = typeof meta.reason === 'string' ? meta.reason : undefined;
      const rollSummary = r.label?.trim() || undefined;
      openDiceRoller(formula, {
        kind: 'gm_request',
        sessionId,
        formula,
        reason,
        rollSummary,
        speakerName,
        nonBlockingUi: true,
      });
    },
    [
      focusCharacterId,
      charactersById,
      npcsById,
      includeSpecialAbilityInSkillRolls,
      sessionId,
      speakerName,
      openDiceRoller,
    ],
  );

  useEffect(() => {
    if (!lastRollRequest || !enabled) return;
    const id = lastRollRequest.id;
    if (!rollAutoOpenPrimedRef.current) {
      rollAutoOpenPrimedRef.current = true;
      lastSeenRollRequestIdRef.current = id;
      return;
    }
    if (lastSeenRollRequestIdRef.current === id) return;
    lastSeenRollRequestIdRef.current = id;
    openGmRollFromMessage(lastRollRequest);
  }, [lastRollRequest, enabled, openGmRollFromMessage]);

  /** Remote (or local) switch to push-to-talk while a session take is active: stop without STT. */
  useEffect(() => {
    if (voiceInputMode !== 'pushToTalk' || !voiceRecording || !recordingStartedInSessionModeRef.current) {
      return;
    }
    void (async () => {
      await stopDiscard();
      setVoiceRecordingStore(false);
      sessionRecordingStartMsRef.current = null;
      recordingStartedInSessionModeRef.current = false;
    })();
  }, [voiceInputMode, voiceRecording, stopDiscard, setVoiceRecordingStore]);

  /**
   * Peer stopped Session mic — finalize our take: stop, STT, POST fragment, merge on server.
   * (Initiator already stopped in `toggleVoice` before broadcasting; this path is for other clients.)
   */
  useEffect(() => {
    const t = sessionVoiceStopAllTick;
    const turnId = sessionVoiceStopTurnId;
    if (t === 0) {
      lastHandledStopAllTickRef.current = 0;
      return;
    }
    if (t === lastHandledStopAllTickRef.current) return;

    if (voiceInputMode !== 'session') {
      lastHandledStopAllTickRef.current = t;
      return;
    }

    if (!turnId) {
      lastHandledStopAllTickRef.current = t;
      return;
    }

    if (!voiceRecordingRef.current) {
      lastHandledStopAllTickRef.current = t;
      return;
    }

    lastHandledStopAllTickRef.current = t;
    const anchor = sessionRecordingStartMsRef.current ?? undefined;
    void (async () => {
      const blob = await stopVoice();
      setVoiceRecordingStore(false);
      sessionRecordingStartMsRef.current = null;
      recordingStartedInSessionModeRef.current = false;
      setVoiceError(null);
      if (!blob || blob.size < 64) {
        setVoiceError('Recording too short');
        return;
      }
      await submitSessionVoiceFragment(turnId, blob, anchor);
    })();
  }, [
    sessionVoiceStopAllTick,
    sessionVoiceStopTurnId,
    voiceInputMode,
    stopVoice,
    setVoiceRecordingStore,
    submitSessionVoiceFragment,
  ]);

  /**
   * Peer pressed Mic in Session — mirror start if idle (mic must be pre-authorized).
   * Uses `voiceRecordingRef` so we don't treat a tick as "already recording" from stale React state after Stop.
   */
  useEffect(() => {
    const t = sessionVoicePeerStartTick;
    if (t === 0) {
      lastConsumedPeerStartTickRef.current = 0;
      return;
    }
    if (t === lastConsumedPeerStartTickRef.current) return;

    if (ignoreNextPeerStartForLocalMicRef.current) {
      ignoreNextPeerStartForLocalMicRef.current = false;
      lastConsumedPeerStartTickRef.current = t;
      return;
    }

    if (!enabled || voiceInputMode !== 'session' || isLoading) return;

    if (voiceRecordingRef.current) {
      lastConsumedPeerStartTickRef.current = t;
      return;
    }

    if (!micReady) return;

    lastConsumedPeerStartTickRef.current = t;
    void (async () => {
      setVoiceError(null);
      recordingStartedInSessionModeRef.current = true;
      sessionRecordingStartMsRef.current = Date.now();
      await startVoice();
      setVoiceRecordingStore(true);
    })();
  }, [
    sessionVoicePeerStartTick,
    enabled,
    micReady,
    voiceInputMode,
    isLoading,
    startVoice,
    setVoiceRecordingStore,
  ]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !enabled) return;
    setSendError(null);
    setChatLoading(true);
    try {
      const accessToken = await getAccessTokenForApi(supabase);
      if (!accessToken) {
        setSendError('Not signed in');
        return;
      }
      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sessionId, playerMessage: text, speakerName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError((data as { error?: string }).error ?? res.statusText ?? 'Request failed');
        return;
      }
      applyGmPostSuccessToStore(data);
      clearPendingVoiceGm();
      clearPendingRollsForVoice();
      setDraft('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatLoading(false);
    }
  }, [draft, enabled, sessionId, speakerName, setChatLoading, clearPendingVoiceGm, clearPendingRollsForVoice]);

  const toggleVoice = useCallback(async () => {
    if (!enabled) return;
    if (!voiceRecording) {
      setVoiceError(null);
      recordingStartedInSessionModeRef.current = voiceInputMode === 'session';
      if (voiceInputMode === 'session') {
        sessionRecordingStartMsRef.current = Date.now();
      } else {
        sessionRecordingStartMsRef.current = null;
      }
      await startVoice();
      setVoiceRecordingStore(true);
      if (voiceInputMode === 'session') {
        ignoreNextPeerStartForLocalMicRef.current = true;
        void broadcastSessionVoicePeerStart();
        window.setTimeout(() => {
          if (ignoreNextPeerStartForLocalMicRef.current) {
            ignoreNextPeerStartForLocalMicRef.current = false;
          }
        }, 800);
      }
      return;
    }
    const wasSessionStop = voiceInputMode === 'session';
    const turnId = wasSessionStop ? crypto.randomUUID() : '';
    const anchor = sessionRecordingStartMsRef.current ?? undefined;
    const blob = await stopVoice();
    setVoiceRecordingStore(false);
    recordingStartedInSessionModeRef.current = false;
    if (wasSessionStop) {
      sessionRecordingStartMsRef.current = null;
    }
    if (wasSessionStop) {
      queueMicrotask(() => {
        void broadcastSessionVoiceStopAll(turnId);
      });
    }
    if (!blob || blob.size < 64) {
      setVoiceError('Recording too short');
      return;
    }
    setVoiceError(null);
    if (wasSessionStop) {
      await submitSessionVoiceFragment(turnId, blob, anchor);
      return;
    }
    setChatLoading(true);
    try {
      const accessToken = await getAccessTokenForApi(supabase);
      if (!accessToken) {
        setVoiceError('Not signed in');
        return;
      }
      const textResult = await voiceBlobToGmPlayerMessage({
        blob,
        focusCharacterId,
        speakerName,
        charactersById,
        npcsById,
        accessToken,
      });
      if (!textResult.ok) {
        setVoiceError(textResult.error);
        return;
      }
      const gmRes = await fetch('/api/gm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId,
          playerMessage: textResult.playerMessage,
          speakerName,
          playerMessageMetadata: textResult.playerMessageMetadata,
        }),
      });
      const gmData = await gmRes.json().catch(() => ({}));
      if (!gmRes.ok) {
        setVoiceError((gmData as { error?: string }).error ?? gmRes.statusText ?? 'AI-GM request failed');
      } else {
        applyGmPostSuccessToStore(gmData);
        clearPendingVoiceGm();
        clearPendingRollsForVoice();
      }
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatLoading(false);
    }
  }, [
    enabled,
    voiceRecording,
    voiceInputMode,
    startVoice,
    stopVoice,
    broadcastSessionVoiceStopAll,
    broadcastSessionVoicePeerStart,
    focusCharacterId,
    sessionId,
    speakerName,
    charactersById,
    npcsById,
    setChatLoading,
    setVoiceRecordingStore,
    clearPendingVoiceGm,
    clearPendingRollsForVoice,
    submitSessionVoiceFragment,
  ]);

  const openRollRequestInRoller = useCallback(
    (m: ChatMessage) => {
      openGmRollFromMessage(m);
    },
    [openGmRollFromMessage],
  );

  const rollHint = useCallback(
    (m: ChatMessage) => {
      const meta = m.metadata as Record<string, unknown> | undefined;
      if (!meta) return null;
      const input = rollRequestMetadataToInput(meta);
      const cid =
        (typeof meta.characterId === 'string' && meta.characterId) || focusCharacterId || null;
      const char = cid ? charactersById[cid] ?? npcsById[cid] : null;
      const r = resolveGmRequestRoll(char, input, {
        includeSpecialAbilityInSkillRolls,
      });
      if (!r.resolvedFromCharacter || !r.label) return null;
      return r.label;
    },
    [focusCharacterId, charactersById, npcsById, includeSpecialAbilityInSkillRolls],
  );

  const rollsForSession = useMemo(
    () =>
      [...pendingRollsForVoice]
        .filter((r) => r.sessionId === sessionId)
        .sort((a, b) => a.rolledAtMs - b.rolledAtMs),
    [pendingRollsForVoice, sessionId],
  );

  return (
    <section className="flex flex-col h-full min-h-0 rounded-lg border border-zinc-700 bg-zinc-900/60">
      <header className="shrink-0 border-b border-zinc-700 px-3 py-2 flex items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-widest text-zinc-400">Session chat</h2>
        {(isLoading || gmNarrationPending) && (
          <span className="text-[10px] text-cyan-400/90 font-mono animate-pulse">
            {isLoading ? 'Working…' : 'AI-GM…'}
          </span>
        )}
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 text-sm"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-zinc-500 text-xs">No messages yet. Say something to the AI-GM.</p>
        ) : (
          messages.map((m) => {
            const sheetHint =
              m.type === 'system' && m.metadata?.kind === 'roll_request' ? rollHint(m) : null;
            return (
            <div
              key={m.id}
              className={`border-l-2 pl-2 py-1.5 rounded-r ${bubbleClasses(m.type, m.metadata)}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wide opacity-80">
                <span className="font-bold text-zinc-300">{m.speaker}</span>
                <span className="text-zinc-500 font-mono">{typeLabel(m.type, m.metadata)}</span>
                <span className="text-zinc-600 font-mono">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words leading-snug">{m.text}</p>
              {sheetHint && (
                <p className="mt-1 text-[10px] text-amber-200/80 font-mono">
                  Sheet match: {sheetHint}
                </p>
              )}
              {m.type === 'system' && m.metadata?.kind === 'roll_request' && (
                <button
                  type="button"
                  onClick={() => openRollRequestInRoller(m)}
                  className="mt-2 text-[10px] uppercase font-bold border border-amber-500/60 bg-amber-950/50 text-amber-200 px-2 py-1 rounded hover:bg-amber-900/40"
                >
                  Open dice roller
                </button>
              )}
            </div>
            );
          })
        )}
        {rollsForSession.length > 0 && (
          <div className="rounded border border-amber-800/50 bg-amber-950/25 px-2 py-2 space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-amber-200/90">
              Saved for voice ({rollsForSession.length})
            </p>
            <ul className="space-y-2">
              {rollsForSession.map((entry) => (
                <li
                  key={entry.id}
                  className="text-xs border border-amber-800/40 rounded p-2 bg-zinc-950/50 text-zinc-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[10px] text-amber-200/80">
                      {new Date(entry.rolledAtMs).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}{' '}
                      · {entry.formula}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="text-[10px] uppercase text-cyan-400 hover:underline"
                        onClick={() => {
                          removePendingRollForVoice(entry.id);
                          openDiceRoller(entry.formula, entry.diceRollIntent);
                        }}
                      >
                        Reroll
                      </button>
                      <button
                        type="button"
                        className="text-[10px] uppercase text-red-400/90 hover:underline"
                        onClick={() => removePendingRollForVoice(entry.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 wrap-break-word line-clamp-3">{entry.playerMessage}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <footer className="shrink-0 border-t border-zinc-700 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
          <span className="text-zinc-400">Voice</span>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="voice-mode"
              className="accent-cyan-600"
              checked={voiceInputMode === 'pushToTalk'}
              disabled={!enabled || voiceRecording || isLoading}
              onChange={() => {
                clearPendingVoiceGm();
                applySessionRecordingBroadcast({ active: false });
                void broadcastSessionRecordingState({ active: false, actorName: speakerName });
                void persistSessionVoiceSettings(supabase, sessionId, {
                  voiceInputMode: 'pushToTalk',
                  sessionRecordingStartedBy: null,
                }).then((r) => {
                  if (r.error && typeof console !== 'undefined') {
                    console.warn('[session] voice settings persist failed', r.error);
                  }
                });
              }}
            />
            Push to talk
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="voice-mode"
              className="accent-cyan-600"
              checked={voiceInputMode === 'session'}
              disabled={!enabled || voiceRecording || isLoading}
              onChange={() => {
                clearPendingVoiceGm();
                applySessionRecordingBroadcast({ active: true, actorName: speakerName });
                void broadcastSessionRecordingState({ active: true, actorName: speakerName });
                void persistSessionVoiceSettings(supabase, sessionId, {
                  voiceInputMode: 'session',
                  sessionRecordingStartedBy: speakerName,
                }).then((r) => {
                  if (r.error && typeof console !== 'undefined') {
                    console.warn('[session] voice settings persist failed', r.error);
                  }
                });
              }}
            />
            Session
          </label>
          <span className="text-zinc-600 normal-case tracking-normal">
            {voiceInputMode === 'session'
              ? 'Stop ends the take: everyone transcribes; one combined message goes to the GM.'
              : 'Stop sends to the GM immediately.'}
          </span>
          {sessionRecordingGroupActive && sessionRecordingStartedBy && (
            <span className="w-full text-[10px] normal-case tracking-normal text-cyan-600/90">
              Group session mode (started by {sessionRecordingStartedBy})
            </span>
          )}
        </div>
        {enabled && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
            {!micReady ? (
              <button
                type="button"
                onClick={() => void acquireMic()}
                disabled={voiceRecording || isLoading}
                className="border border-cyan-700/60 bg-cyan-950/40 text-cyan-200 px-2 py-1 rounded hover:bg-cyan-900/50 disabled:opacity-50 normal-case tracking-normal"
              >
                Enable microphone (one-time — keeps mic open for Session takes without re-prompting)
              </button>
            ) : (
              <>
                <span className="text-emerald-500/90 normal-case tracking-normal">Mic ready</span>
                {!voiceRecording && (
                  <button
                    type="button"
                    onClick={() => releaseMic()}
                    className="text-zinc-500 hover:text-zinc-300 normal-case tracking-normal underline"
                  >
                    Release mic
                  </button>
                )}
                <span className="text-zinc-600 normal-case tracking-normal">
                  With mic enabled, when anyone presses Mic in Session mode, your client starts recording too.
                  Stop ends the take for everyone; each client transcribes and the server merges dialogue.
                </span>
              </>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={enabled ? 'Message the AI-GM…' : 'Sign in to chat'}
            disabled={!enabled || isLoading}
            className="flex-1 min-w-0 bg-zinc-950 border border-zinc-600 rounded px-2 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            title={
              voiceRecording
                ? 'Stop and transcribe'
                : voiceInputMode === 'session'
                  ? 'Start recording (stop to transcribe; then Send voice to GM)'
                  : 'Start recording (stop sends to GM)'
            }
            onClick={() => void toggleVoice()}
            disabled={!enabled || isLoading}
            className={`shrink-0 text-white text-sm font-bold uppercase px-3 py-2 rounded border disabled:opacity-50 ${
              voiceRecording
                ? 'bg-red-800 hover:bg-red-700 border-red-500/60 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-600'
            }`}
          >
            {voiceRecording ? 'Stop' : 'Mic'}
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!enabled || isLoading || !draft.trim()}
            className="shrink-0 bg-cyan-800 hover:bg-cyan-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-bold uppercase px-4 py-2 rounded border border-cyan-600/50"
          >
            Send
          </button>
        </div>
        {sendError && <p className="text-xs text-red-400">{sendError}</p>}
        {(voiceError || voiceHookError) && (
          <p className="text-xs text-red-400">{voiceError ?? voiceHookError}</p>
        )}
      </footer>
    </section>
  );
}
