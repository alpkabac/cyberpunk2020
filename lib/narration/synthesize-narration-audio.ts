import { synthesizeCartesiaNarrationWav } from './cartesia-tts';
import { synthesizeChatterboxNarration } from './chatterbox-tts';
import { synthesizeKokoroNarration } from './kokoro-tts';
import { synthesizeOmnivoiceNarration } from './omnivoice-tts';
import { type NarrationTtsClientConfig, effectiveNarrationProvider } from './narration-tts-client-config';

export type NarrationAudioSynthResult =
  | { ok: true; buffer: Buffer; mimeType: string }
  | { ok: false; status: number; error: string; detail?: string };

export async function synthesizeNarrationAudio(
  transcript: string,
  config: NarrationTtsClientConfig,
  logContext?: { sessionId?: string; label?: string },
): Promise<NarrationAudioSynthResult> {
  const provider = effectiveNarrationProvider(config);
  if (provider === null) {
    return {
      ok: false,
      status: 400,
      error:
        'Cartesia cloud TTS is disabled. Pick Chatterbox, Kokoro, or OmniVoice and set the local server URL.',
    };
  }

  switch (provider) {
    case 'cartesia': {
      const r = await synthesizeCartesiaNarrationWav(transcript, logContext);
      if (!r.ok) return r;
      return { ok: true, buffer: r.buffer, mimeType: 'audio/wav' };
    }
    case 'chatterbox':
      return synthesizeChatterboxNarration(transcript, config, logContext);
    case 'kokoro':
      return synthesizeKokoroNarration(transcript, config, logContext);
    case 'omnivoice':
      return synthesizeOmnivoiceNarration(transcript, config, logContext);
    default:
      return { ok: false, status: 500, error: 'Unknown TTS provider' };
  }
}
