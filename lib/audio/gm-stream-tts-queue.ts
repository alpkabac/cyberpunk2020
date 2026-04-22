/**
 * Queues narration TTS chunks (POST /api/session/narration-tts) for streamed GM narration.
 * Prefetches the next chunk while the current chunk plays so auto-TTS stays close to the stream.
 */
type PrefetchSlot = {
  promise: Promise<Blob | null>;
  abort: AbortController;
};

export class GmStreamTtsQueue {
  private queue: string[] = [];
  private pumpRunning = false;
  private cancelled = false;
  private currentAudio: HTMLAudioElement | null = null;
  /** Next chunk being synthesized; cleared when the pump takes ownership to await (allows another kick). */
  private nextPrefetch: PrefetchSlot | null = null;
  /** Every in-flight fetch (including one whose slot was taken but await not finished). */
  private readonly activeFetchAborts = new Set<AbortController>();

  constructor(
    private readonly opts: {
      sessionId: string;
      getToken: () => Promise<string | null>;
      getVolume: () => number;
    },
  ) {}

  resetCancelFlag(): void {
    this.cancelled = false;
  }

  cancel(): void {
    this.cancelled = true;
    this.queue = [];
    this.nextPrefetch = null;
    for (const ac of this.activeFetchAborts) {
      try {
        ac.abort();
      } catch {
        /* ignore */
      }
    }
    this.activeFetchAborts.clear();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
      } catch {
        /* ignore */
      }
      this.currentAudio = null;
    }
  }

  enqueue(text: string): void {
    const t = text.trim();
    if (t.length < 2) return;
    this.queue.push(t);
    void this.pump();
  }

  private async fetchChunkBlob(text: string, signal: AbortSignal): Promise<Blob | null> {
    try {
      const token = await this.opts.getToken();
      if (!token || this.cancelled) return null;
      const res = await fetch('/api/session/narration-tts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: this.opts.sessionId, text }),
        signal,
      });
      if (!res.ok || this.cancelled) return null;
      return await res.blob();
    } catch (e) {
      if (signal.aborted) return null;
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      if (typeof console !== 'undefined') {
        console.warn('[gm-stream-tts] chunk fetch failed', e);
      }
      return null;
    }
  }

  /** Start fetch for the next queued sentence if nothing is already in flight. */
  private kickNextFetch(): void {
    if (this.nextPrefetch !== null || this.queue.length === 0 || this.cancelled) return;
    const ac = new AbortController();
    this.activeFetchAborts.add(ac);
    const chunk = this.queue.shift()!;
    const promise = this.fetchChunkBlob(chunk, ac.signal);
    const slot: PrefetchSlot = { promise, abort: ac };
    void promise.finally(() => {
      this.activeFetchAborts.delete(ac);
      if (this.nextPrefetch === slot) {
        this.nextPrefetch = null;
      }
    });
    this.nextPrefetch = slot;
  }

  private async pump(): Promise<void> {
    if (this.pumpRunning) return;
    this.pumpRunning = true;
    try {
      this.kickNextFetch();

      while (!this.cancelled) {
        if (!this.nextPrefetch) {
          this.kickNextFetch();
          if (!this.nextPrefetch) break;
        }

        const slot = this.nextPrefetch;
        this.nextPrefetch = null;
        const blob = await slot.promise;
        if (this.cancelled) break;
        if (!blob) continue;

        // Prefetch the following sentence while this one plays.
        this.kickNextFetch();

        const objectUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          const a = new Audio(objectUrl);
          this.currentAudio = a;
          a.volume = this.opts.getVolume();
          const cleanup = () => {
            URL.revokeObjectURL(objectUrl);
            if (this.currentAudio === a) this.currentAudio = null;
            resolve();
          };
          a.onended = cleanup;
          a.onerror = cleanup;
          void a.play().catch(() => cleanup());
        });
      }
    } finally {
      this.pumpRunning = false;
    }
  }
}
