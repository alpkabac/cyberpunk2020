'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVoiceRecorderResult {
  isRecording: boolean;
  /** Mic permission acquired and audio track is live (reuse for multiple takes without a new gesture). */
  micReady: boolean;
  error: string | null;
  /** One-time user gesture: opens mic and keeps the stream until `releaseMic` or unmount. */
  acquireMic: () => Promise<void>;
  /** Stops tracks (revokes capture). Safe to call when not recording. */
  releaseMic: () => void;
  /** Starts MediaRecorder on the existing or newly requested stream. */
  start: () => Promise<void>;
  /** Stops recording and returns audio blob; keeps the mic stream for the next take. */
  stop: () => Promise<Blob | null>;
  /** Stops MediaRecorder without returning audio (e.g. remote cancelled session mode). */
  stopDiscard: () => Promise<void>;
}

function pickMimeType(): string {
  return MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
}

/**
 * Captures microphone audio via MediaRecorder (WebRTC getUserMedia).
 * After `acquireMic()` (or the first `start()`), the MediaStream is kept so later
 * `start`/`stop` cycles do not require a new user gesture.
 */
export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef('audio/webm');

  const attachStreamCleanup = useCallback((stream: MediaStream) => {
    for (const t of stream.getAudioTracks()) {
      t.addEventListener('ended', () => {
        if (streamRef.current === stream) {
          streamRef.current = null;
          setMicReady(false);
        }
      });
    }
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    const existing = streamRef.current;
    if (existing?.getAudioTracks().some((t) => t.readyState === 'live')) {
      return existing;
    }
    streamRef.current = null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    attachStreamCleanup(stream);
    setMicReady(true);
    return stream;
  }, [attachStreamCleanup]);

  const acquireMic = useCallback(async () => {
    setError(null);
    try {
      await ensureStream();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMicReady(false);
    }
  }, [ensureStream]);

  const releaseMic = useCallback(() => {
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.ondataavailable = null;
      mr.onstop = null;
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
    }
    chunksRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
    setMicReady(false);
  }, []);

  useEffect(() => () => releaseMic(), [releaseMic]);

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    try {
      const stream = await ensureStream();
      const mime = pickMimeType();
      mimeRef.current = mime;
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(250);
      setIsRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ensureStream]);

  const stop = useCallback((): Promise<Blob | null> => {
    const mr = recorderRef.current;
    if (!mr || mr.state === 'inactive') {
      setIsRecording(false);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      mr.onstop = () => {
        recorderRef.current = null;
        setIsRecording(false);
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mimeRef.current })
            : null;
        chunksRef.current = [];
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  const stopDiscard = useCallback(async (): Promise<void> => {
    const mr = recorderRef.current;
    if (!mr || mr.state === 'inactive') {
      setIsRecording(false);
      chunksRef.current = [];
      return;
    }
    await new Promise<void>((resolve) => {
      mr.onstop = () => {
        recorderRef.current = null;
        setIsRecording(false);
        chunksRef.current = [];
        resolve();
      };
      mr.stop();
    });
  }, []);

  return {
    isRecording,
    micReady,
    error,
    acquireMic,
    releaseMic,
    start,
    stop,
    stopDiscard,
  };
}
