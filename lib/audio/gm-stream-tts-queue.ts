/**
 * Queues Cartesia TTS chunks (POST /api/session/narration-tts) for streamed GM narration.
 */
export class GmStreamTtsQueue {
  private queue: string[] = [];
  private pumpRunning = false;
  private cancelled = false;
  private currentAudio: HTMLAudioElement | null = null;

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

  private async pump(): Promise<void> {
    if (this.pumpRunning) return;
    this.pumpRunning = true;
    try {
      while (this.queue.length > 0 && !this.cancelled) {
        const chunk = this.queue.shift()!;
        const token = await this.opts.getToken();
        if (!token || this.cancelled) break;

        const res = await fetch('/api/session/narration-tts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: this.opts.sessionId, text: chunk }),
        });
        if (!res.ok || this.cancelled) continue;

        const blob = await res.blob();
        if (this.cancelled) continue;

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
