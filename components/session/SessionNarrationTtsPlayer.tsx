'use client';

import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { unlockHtmlAudioFromUserGesture } from '@/lib/audio/unlock-html-audio';
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

    const { messageId, playAtMs } = cue;
    let cancelled = false;
    const ac = new AbortController();
    let objectUrl: string | null = null;
    const delayMs = Math.max(0, playAtMs - Date.now());

    const run = async () => {
      if (cancelled) return;
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
      const blob = await res.blob();
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
