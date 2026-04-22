import { reportServerError } from '@/lib/logging/server-report';
import type { NarrationTtsClientConfig } from './narration-tts-client-config';
import { concatWavBuffers, splitTextForOmnivoiceChunks } from './concat-wav-buffers';

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function assertHttpUrl(base: string): URL {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error('Invalid OmniVoice base URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('OmniVoice URL must be http or https');
  }
  if (!u.hostname) throw new Error('OmniVoice URL needs a host');
  return u;
}

/** Below maxDuration (120s) on Vercel/Render; single long requests often time out first. */
const SYNTH_TIMEOUT_MS = 115_000;

/** Long narration: multiple non-streaming calls, then concat WAV (same engine format). */
const OMNIVOICE_SPLIT_AT_CHARS = 1600;

/**
 * omnivoice-server: POST /v1/audio/speech (OpenAI-style).
 * Use `language` (e.g. tr) for multilingual pronunciation; `stream: false` returns a single WAV blob.
 */
export async function synthesizeOmnivoiceNarration(
  transcript: string,
  config: NarrationTtsClientConfig,
  logContext?: { sessionId?: string; label?: string },
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; status: number; error: string; detail?: string }> {
  const baseRaw = config.localBaseUrl?.trim();
  if (!baseRaw) {
    return { ok: false, status: 400, error: 'Set OmniVoice (omnivoice-server) base URL in narration TTS settings' };
  }

  const base = normalizeBaseUrl(baseRaw);
  try {
    assertHttpUrl(base);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 400, error: msg };
  }

  const o = config.omnivoice ?? {};
  const responseFormat = o.responseFormat === 'pcm' ? 'pcm' : 'wav';
  const parts =
    responseFormat === 'wav' && transcript.length > OMNIVOICE_SPLIT_AT_CHARS
      ? splitTextForOmnivoiceChunks(transcript, OMNIVOICE_SPLIT_AT_CHARS)
      : [transcript];

  if (parts.length === 1) {
    return synthOnePart(base, o, parts[0]!, responseFormat, logContext);
  }

  const buffers: Buffer[] = [];
  for (const part of parts) {
    const r = await synthOnePart(base, o, part, responseFormat, logContext);
    if (!r.ok) return r;
    buffers.push(r.buffer);
  }
  const merged = concatWavBuffers(buffers);
  if (merged.length < 32) {
    return { ok: false, status: 502, error: 'OmniVoice returned empty audio after merge' };
  }
  return { ok: true, buffer: merged, mimeType: 'audio/wav' };
}

async function synthOnePart(
  base: string,
  o: NonNullable<NarrationTtsClientConfig['omnivoice']>,
  transcript: string,
  responseFormat: 'wav' | 'pcm',
  logContext?: { sessionId?: string; label?: string },
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; status: number; error: string; detail?: string }> {
  const voice = o.voice?.trim() || 'alloy';
  const model = o.model?.trim() || 'omnivoice';

  const body: Record<string, unknown> = {
    model,
    input: transcript,
    voice,
    response_format: responseFormat,
    stream: false,
    speed: typeof o.speed === 'number' && Number.isFinite(o.speed) ? o.speed : 1,
    language: o.language?.trim() || 'tr',
  };

  if (o.speaker?.trim()) body.speaker = o.speaker.trim();
  if (o.instructions?.trim()) body.instructions = o.instructions.trim();

  if (typeof o.numStep === 'number' && Number.isFinite(o.numStep)) body.num_step = o.numStep;
  if (typeof o.guidanceScale === 'number' && Number.isFinite(o.guidanceScale)) {
    body.guidance_scale = o.guidanceScale;
  }
  if (typeof o.positionTemperature === 'number' && Number.isFinite(o.positionTemperature)) {
    body.position_temperature = o.positionTemperature;
  }
  if (typeof o.classTemperature === 'number' && Number.isFinite(o.classTemperature)) {
    body.class_temperature = o.classTemperature;
  }
  if (typeof o.denoise === 'boolean') body.denoise = o.denoise;
  if (typeof o.tShift === 'number' && Number.isFinite(o.tShift)) body.t_shift = o.tShift;
  if (typeof o.duration === 'number' && Number.isFinite(o.duration)) body.duration = o.duration;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'audio/*, application/json',
  };
  const token = o.apiKey?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = new URL('/v1/audio/speech', `${base}/`);
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), SYNTH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      reportServerError(
        'omnivoice-tts',
        new Error(errBody || res.statusText),
        { status: res.status, ...logContext },
      );
      return {
        ok: false,
        status: 502,
        error: 'OmniVoice TTS error',
        detail: errBody.slice(0, 500),
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) {
      return { ok: false, status: 502, error: 'OmniVoice returned empty audio' };
    }
    const ct = res.headers.get('content-type')?.toLowerCase() ?? '';
    let mimeType = 'audio/wav';
    if (ct.includes('mpeg') || ct.includes('mp3')) mimeType = 'audio/mpeg';
    else if (ct.includes('pcm') || responseFormat === 'pcm') mimeType = 'audio/pcm';
    else if (ct.includes('wav') || responseFormat === 'wav') mimeType = 'audio/wav';
    return { ok: true, buffer: buf, mimeType };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, status: 504, error: 'OmniVoice TTS request timed out' };
    }
    reportServerError('omnivoice-tts', e, logContext ?? {});
    return { ok: false, status: 500, error: 'OmniVoice TTS request failed' };
  } finally {
    clearTimeout(tid);
  }
}
