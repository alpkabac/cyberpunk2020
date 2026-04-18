/**
 * Browsers only allow HTMLAudioElement.play() without blocking when the document
 * has a recent user gesture (or "unlocked" audio). TTS runs after async work, so
 * we prime playback from a gesture and from the first tap/key in the session.
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      sharedCtx = new AC();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * Call synchronously from click / pointerdown / keydown handlers so later
 * `HTMLAudioElement.play()` after fetch is more likely to succeed.
 */
export function unlockHtmlAudioFromUserGesture(): void {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  try {
    const silent =
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
    const a = new Audio(silent);
    a.volume = 0.001;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
