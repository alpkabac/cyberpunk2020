import { concatPcmWavBuffers } from './concat-pcm-wav';
import { voiceMemoryShallowEqual } from './chatterbox-npc-voice-memory';
import { synthesizeCartesiaNarrationWav } from './cartesia-tts';
import { synthesizeChatterboxNarration } from './chatterbox-tts';
import {
  buildChatterboxNarrationSegments,
  clientConfigForChatterboxRule,
} from './chatterbox-npc-narration-segments';
import { synthesizeKokoroNarration } from './kokoro-tts';
import { type NarrationTtsClientConfig, effectiveNarrationProvider } from './narration-tts-client-config';

export type NarrationAudioLogContext = {
  sessionId?: string;
  label?: string;
  /** `chat_messages.speaker` — Chatterbox maps NPCs using session rules. */
  messageSpeaker?: string | null;
};

export type SynthesizeNarrationOptions = {
  /** Session `chatterboxNpcVoiceMemory` for Chatterbox list-order continuity across messages. */
  chatterboxVoiceMemory?: Record<string, number>;
};

export type NarrationAudioSynthResult =
  | {
      ok: true;
      buffer: Buffer;
      mimeType: string;
      /** Present when Chatterbox list-order memory was updated; routes persist to `sessions.settings`. */
      chatterboxVoiceMemoryOut?: Record<string, number>;
    }
  | { ok: false; status: number; error: string; detail?: string };

function chatterboxMemoryDelta(
  inMem: Record<string, number> | undefined,
  outMem: Record<string, number>,
): Record<string, number> | undefined {
  if (voiceMemoryShallowEqual(inMem, outMem)) return undefined;
  return { ...outMem };
}

export async function synthesizeNarrationAudio(
  transcript: string,
  config: NarrationTtsClientConfig,
  logContext?: NarrationAudioLogContext,
  options?: SynthesizeNarrationOptions,
): Promise<NarrationAudioSynthResult> {
  const provider = effectiveNarrationProvider(config);
  if (provider === null) {
    return {
      ok: false,
      status: 400,
      error: 'Cartesia cloud TTS is disabled. Pick Chatterbox or Kokoro and set the local server URL.',
    };
  }

  switch (provider) {
    case 'cartesia': {
      const r = await synthesizeCartesiaNarrationWav(transcript, logContext);
      if (!r.ok) return r;
      return { ok: true, buffer: r.buffer, mimeType: 'audio/wav' };
    }
    case 'chatterbox': {
      const rules = config.chatterboxNpcVoices;
      if (!rules || rules.length === 0) {
        return synthesizeChatterboxNarration(transcript, config, logContext);
      }
      const memIn = options?.chatterboxVoiceMemory ?? {};
      const { segments: segs, voiceMemory } = buildChatterboxNarrationSegments(
        transcript,
        (logContext?.messageSpeaker && logContext.messageSpeaker.length > 0
          ? logContext.messageSpeaker
          : 'Game Master') as string,
        rules,
        config.chatterboxNpcVoiceMode ?? 'byName',
        memIn,
      );
      const memDelta = chatterboxMemoryDelta(memIn, voiceMemory);
      if (segs.length === 0) {
        return { ok: false, status: 400, error: 'Nothing to speak' };
      }
      if (segs.length === 1) {
        const c = clientConfigForChatterboxRule(config, segs[0]!.rule, {});
        const r = await synthesizeChatterboxNarration(segs[0]!.text, c, logContext);
        if (!r.ok) return r;
        return {
          ok: true,
          buffer: r.buffer,
          mimeType: r.mimeType,
          ...(memDelta ? { chatterboxVoiceMemoryOut: memDelta } : {}),
        };
      }
      const needWav = segs.length > 1;
      const bufs: Buffer[] = [];
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!;
        const c = clientConfigForChatterboxRule(config, s.rule, { forceWav: needWav });
        const r = await synthesizeChatterboxNarration(s.text, c, {
          ...logContext,
          label: logContext?.label ? `${logContext.label}-${i}` : `seg-${i}`,
        });
        if (!r.ok) return r;
        bufs.push(r.buffer);
      }
      try {
        return {
          ok: true,
          buffer: concatPcmWavBuffers(bufs),
          mimeType: 'audio/wav',
          ...(memDelta ? { chatterboxVoiceMemoryOut: memDelta } : {}),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'WAV concat failed';
        return { ok: false, status: 500, error: msg };
      }
    }
    case 'kokoro':
      return synthesizeKokoroNarration(transcript, config, logContext);
    default:
      return { ok: false, status: 500, error: 'Unknown TTS provider' };
  }
}
