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
import {
  mergeNarrationTtsClientConfig,
  narrationTtsConfigFingerprint,
} from '@/lib/narration/narration-tts-client-config';
import { tryFetchOmnivoiceWavInBrowser } from '@/lib/narration/omnivoice-local-browser-tts';
import { plainTextForNarrationTts } from '@/lib/narration/plain-text-for-tts';
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

  /** Drop in-memory cache when switching sessions (IDB keeps per-session keys). */
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
      unlockHtmlAudioFromUserGesture();
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

      const configFp = narrationTtsConfigFingerprint(
        mergeNarrationTtsClientConfig(useGameStore.getState().session.settings.narrationTts),
      );
      let blob: Blob | undefined = getNarrationTtsFromMemory(sessionId, messageId, configFp);
      if (!blob) {
        const fromIdb = await getNarrationTtsFromIdb(sessionId, messageId, configFp);
        if (fromIdb) {
          blob = fromIdb;
          if (!cancelled) setNarrationTtsInMemory(sessionId, messageId, configFp, fromIdb);
        }
      }
      if (blob && !cancelled) {
        playBlob(blob);
        return;
      }

      const ttsConfig = mergeNarrationTtsClientConfig(
        useGameStore.getState().session.settings.narrationTts,
      );
      const row = useGameStore.getState().chat.messages.find((m) => m.id === messageId);
      const transcript =
        row?.type === 'narration' && typeof row.text === 'string'
          ? plainTextForNarrationTts(row.text)
          : '';

      if (transcript.length > 0 && !cancelled) {
        const localBlob = await tryFetchOmnivoiceWavInBrowser(ttsConfig, transcript, ac.signal);
        if (localBlob && !cancelled) {
          setNarrationTtsInMemory(sessionId, messageId, configFp, localBlob);
          void setNarrationTtsInIdb(sessionId, messageId, configFp, localBlob);
          playBlob(localBlob);
          return;
        }
      }

      const token = await getAccessTokenForApi(supabase);
      if (!token || cancelled) {
        if (typeof console !== 'undefined' && !cancelled) {
          console.warn('[narration-tts] no auth token; cannot fetch TTS. Sign in again or refresh the page.');
        }
        return;
      }
      const q = new URLSearchParams({ sessionId, messageId });
      const res = await fetch(`/api/session/narration-tts?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
      });
      if (!res.ok || cancelled) {
        if (typeof console !== 'undefined' && !cancelled) {
          const errText = await res.text().catch(() => '');
          let detail = errText;
          try {
            const j = JSON.parse(errText) as { error?: string; detail?: string };
            detail = [j.error, j.detail].filter((s) => typeof s === 'string' && s.length > 0).join(' — ');
          } catch {
            /* not JSON */
          }
          console.warn('[narration-tts] GET /api/session/narration-tts failed', res.status, detail || res.statusText);
        }
        return;
      }
      const fetched = await res.blob();
      if (cancelled) return;
      setNarrationTtsInMemory(sessionId, messageId, configFp, fetched);
      void setNarrationTtsInIdb(sessionId, messageId, configFp, fetched);
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

  return <audio ref={audioRef} preload="auto" playsInline className="hidden" />;
}
