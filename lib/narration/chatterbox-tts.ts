import { reportServerError } from '@/lib/logging/server-report';
import type { NarrationTtsClientConfig } from './narration-tts-client-config';

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function assertHttpUrl(base: string): URL {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error('Invalid Chatterbox base URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Chatterbox URL must be http or https');
  }
  if (!u.hostname) throw new Error('Chatterbox URL needs a host');
  return u;
}

export async function synthesizeChatterboxNarration(
  transcript: string,
  config: NarrationTtsClientConfig,
  logContext?: { sessionId?: string; label?: string },
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; status: number; error: string; detail?: string }> {
  const baseRaw = config.localBaseUrl?.trim();
  if (!baseRaw) {
    return { ok: false, status: 400, error: 'Set Chatterbox base URL in narration TTS settings' };
  }

  const base = normalizeBaseUrl(baseRaw);
  try {
    assertHttpUrl(base);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 400, error: msg };
  }

  const cb = config.chatterbox ?? {};
  const useOpenAi = cb.useOpenAiEndpoint === true;

  try {
    if (useOpenAi) {
      const url = new URL('/v1/audio/speech', `${base}/`);
      const voice =
        cb.openAiVoice?.trim() ||
        cb.predefinedVoiceId?.trim() ||
        'S1';
      const responseFormat = cb.outputFormat === 'opus' ? 'opus' : 'wav';
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
        body: JSON.stringify({
          model: 'tts-1',
          input: transcript,
          voice,
          response_format: responseFormat,
          speed: typeof cb.speed === 'number' ? cb.speed : 1,
          ...(typeof cb.seed === 'number' ? { seed: cb.seed } : {}),
          ...(typeof cb.temperature === 'number' && Number.isFinite(cb.temperature)
            ? { temperature: cb.temperature }
            : {}),
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        reportServerError(
          'chatterbox-tts:openai',
          new Error(errBody || res.statusText),
          { status: res.status, ...logContext },
        );
        return {
          ok: false,
          status: 502,
          error: 'Chatterbox TTS error',
          detail: errBody.slice(0, 500),
        };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 32) {
        return { ok: false, status: 502, error: 'Chatterbox returned empty audio' };
      }
      const mime =
        responseFormat === 'opus' ? 'audio/ogg' : 'audio/wav';
      return { ok: true, buffer: buf, mimeType: mime };
    }

    const url = new URL('/tts', `${base}/`);
    const rawChunk = typeof cb.chunkSize === 'number' && Number.isFinite(cb.chunkSize) ? cb.chunkSize : 120;
    const chunkSize = Math.min(500, Math.max(50, Math.round(rawChunk)));
    const body: Record<string, unknown> = {
      text: transcript,
      voice_mode: cb.voiceMode === 'clone' ? 'clone' : 'predefined',
      output_format: cb.outputFormat === 'opus' ? 'opus' : 'wav',
      split_text: cb.splitText !== false,
      chunk_size: chunkSize,
    };
    if (cb.voiceMode === 'clone' && cb.referenceAudioFilename?.trim()) {
      body.reference_audio_filename = cb.referenceAudioFilename.trim();
    } else if (cb.predefinedVoiceId?.trim()) {
      body.predefined_voice_id = cb.predefinedVoiceId.trim();
    }
    if (typeof cb.temperature === 'number') body.temperature = cb.temperature;
    if (typeof cb.exaggeration === 'number') body.exaggeration = cb.exaggeration;
    if (typeof cb.cfgWeight === 'number') body.cfg_weight = cb.cfgWeight;
    if (typeof cb.seed === 'number') body.seed = cb.seed;
    if (typeof cb.speedFactor === 'number') body.speed_factor = cb.speedFactor;
    if (cb.language?.trim()) body.language = cb.language.trim();

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      reportServerError(
        'chatterbox-tts:custom',
        new Error(errBody || res.statusText),
        { status: res.status, ...logContext },
      );
      return {
        ok: false,
        status: 502,
        error: 'Chatterbox TTS error',
        detail: errBody.slice(0, 500),
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) {
      return { ok: false, status: 502, error: 'Chatterbox returned empty audio' };
    }
    const ct = res.headers.get('content-type')?.toLowerCase() ?? '';
    let mimeType = 'audio/wav';
    if (ct.includes('ogg') || ct.includes('opus')) mimeType = 'audio/ogg';
    else if (ct.includes('wav')) mimeType = 'audio/wav';
    else if (body.output_format === 'opus') mimeType = 'audio/ogg';
    return { ok: true, buffer: buf, mimeType };
  } catch (e) {
    reportServerError('chatterbox-tts', e, logContext ?? {});
    return { ok: false, status: 500, error: 'Chatterbox TTS request failed' };
  }
}
