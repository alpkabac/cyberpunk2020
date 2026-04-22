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
    throw new Error('Invalid Kokoro base URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Kokoro URL must be http or https');
  }
  if (!u.hostname) throw new Error('Kokoro URL needs a host');
  return u;
}

export async function synthesizeKokoroNarration(
  transcript: string,
  config: NarrationTtsClientConfig,
  logContext?: { sessionId?: string; label?: string },
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; status: number; error: string; detail?: string }> {
  const baseRaw = config.localBaseUrl?.trim();
  if (!baseRaw) {
    return { ok: false, status: 400, error: 'Set Kokoro base URL in narration TTS settings' };
  }

  const base = normalizeBaseUrl(baseRaw);
  try {
    assertHttpUrl(base);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 400, error: msg };
  }

  const k = config.kokoro ?? {};
  const model = k.model?.trim() || 'kokoro';
  const voice = k.voice?.trim() || 'af_heart';
  const responseFormat = k.responseFormat === 'wav' ? 'wav' : 'mp3';

  const url = new URL('/v1/audio/speech', `${base}/`);
  const body: Record<string, unknown> = {
    model,
    input: transcript,
    voice,
    response_format: responseFormat,
    download_format: responseFormat,
    speed: typeof k.speed === 'number' ? k.speed : 1,
    /** Server proxy expects a single audio blob, not an SSE stream. */
    stream: false,
    return_download_link: false,
  };
  if (k.langCode?.trim()) body.lang_code = k.langCode.trim();
  if (typeof k.volumeMultiplier === 'number') body.volume_multiplier = k.volumeMultiplier;

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      reportServerError(
        'kokoro-tts',
        new Error(errBody || res.statusText),
        { status: res.status, ...logContext },
      );
      return {
        ok: false,
        status: 502,
        error: 'Kokoro TTS error',
        detail: errBody.slice(0, 500),
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) {
      return { ok: false, status: 502, error: 'Kokoro returned empty audio' };
    }
    const mimeType = responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
    return { ok: true, buffer: buf, mimeType };
  } catch (e) {
    reportServerError('kokoro-tts', e, logContext ?? {});
    return { ok: false, status: 500, error: 'Kokoro TTS request failed' };
  }
}
