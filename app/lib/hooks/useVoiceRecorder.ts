'use client';

import { useCallback, useRef, useState } from 'react';

export interface UseVoiceRecorderResult {
  isRecording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
}

/**
 * Captures microphone audio via MediaRecorder (WebRTC getUserMedia).
 * Collects timesliced chunks and returns one blob on stop (uploaded to `/api/voice` as a single file).
 */
export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef('audio/webm');

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
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
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    const mr = recorderRef.current;
    if (!mr || mr.state === 'inactive') {
      setIsRecording(false);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      mr.onstop = () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setIsRecording(false);
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mimeRef.current })
            : null;
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  return { isRecording, error, start, stop };
}
