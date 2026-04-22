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
    if (ctx) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      o.frequency.value = 440;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.03);
    }
  } catch {
    /* ignore */
  }
}
