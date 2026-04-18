'use client';

import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { unlockHtmlAudioFromUserGesture } from '@/lib/audio/unlock-html-audio';
import {
  clearNarrationTtsMemoryForSession,
  getNarrationTtsFromIdb,
  getNarrationTtsFromMemory,
  setNarrationTtsInIdb,
  setNarrationTtsInMemory,
} from '@/lib/audio/narration-tts-message-cache';
import { supabase } from '@/lib/supabase';
import { useGameStore } from '@/lib/store/game-store';

export function SessionNarrationTtsPlayer({ sessionId }: { sessionId: string }) {
  const { cueSeq, narrationVolume } = useGameStore(
    useShallow((s) => ({
      cueSeq: s.ui.narrationTtsCue?.seq ?? 0,
      narrationVolume: s.ui.audioNarrationVolume,
    })),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);

  /** Drop in-memory WAV cache when switching sessions (IDB keeps per-session keys). */
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    if (prev && prev !== sessionId) {
      clearNarrationTtsMemoryForSession(prev);
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  /** Peers who never clicked "speak" still need one gesture before remote TTS can play. */
  useEffect(() => {
    const prime = () => unlockHtmlAudioFromUserGesture();
    window.addEventListener('pointerdown', prime, { capture: true, passive: true });
    window.addEventListener('keydown', prime, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', prime, { capture: true });
      window.removeEventListener('keydown', prime, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (cueSeq === 0) return;
    const cue = useGameStore.getState().ui.narrationTtsCue;
    if (!cue || !sessionId) return;

    const audio = audioRef.current;
    if (!audio) return;

    const { messageId, playAfterMs } = cue;
    let cancelled = false;
    const ac = new AbortController();
    let objectUrl: string | null = null;
    const delayMs = Math.min(Math.max(playAfterMs, 0), 120_000);

    const playBlob = (blob: Blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      audio.volume = useGameStore.getState().ui.audioNarrationVolume;
      audio.src = objectUrl;
      void audio.play().catch((e) => {
        if (typeof console !== 'undefined') {
          console.warn(
            '[narration-tts] play() failed (often autoplay: tap the page or Speak button once)',
            e,
          );
        }
      });
    };

    const run = async () => {
      if (cancelled) return;

      let blob: Blob | undefined = getNarrationTtsFromMemory(sessionId, messageId);
      if (!blob) {
        const fromIdb = await getNarrationTtsFromIdb(sessionId, messageId);
        if (fromIdb) {
          blob = fromIdb;
          if (!cancelled) setNarrationTtsInMemory(sessionId, messageId, fromIdb);
        }
      }
      if (blob && !cancelled) {
        playBlob(blob);
        return;
      }

      const token = await getAccessTokenForApi(supabase);
      if (!token || cancelled) return;
      const q = new URLSearchParams({ sessionId, messageId });
      const res = await fetch(`/api/session/narration-tts?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
      });
      if (!res.ok || cancelled) {
        if (typeof console !== 'undefined' && !cancelled) {
          console.warn('[narration-tts] fetch failed', res.status);
        }
        return;
      }
      const fetched = await res.blob();
      if (cancelled) return;
      setNarrationTtsInMemory(sessionId, messageId, fetched);
      void setNarrationTtsInIdb(sessionId, messageId, fetched);
      playBlob(fetched);
    };

    const tid = window.setTimeout(run, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
      ac.abort();
      audio.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      audio.removeAttribute('src');
    };
  }, [cueSeq, sessionId]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = narrationVolume;
  }, [narrationVolume]);

  return <audio ref={audioRef} preload="none" playsInline className="hidden" />;
}
