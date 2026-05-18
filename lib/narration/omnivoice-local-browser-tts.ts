/**
 * When OmniVoice is bound to loopback in TTS settings, the **browser** can reach
 * `http://127.0.0.1:…` on the same machine, but a **hosted** Next server cannot.
 * In that case we POST to omnivoice-server from the client (CORS: allow * on typical servers).
 * Long lines still use the app API (server-side chunking) when this returns null.
 */
import type { NarrationTtsClientConfig } from './narration-tts-client-config';
import { effectiveNarrationProvider } from './narration-tts-client-config';
import { splitTextForOmnivoiceChunks } from './concat-wav-buffers';
import { OMNIVOICE_SPLIT_AT_CHARS, buildOmnivoiceSpeechRequestBody } from './omnivoice-speech-body';

const SYNTH_TIMEOUT_MS = 115_000;

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * `127.0.0.1`, `localhost`, `::1` — same-machine OmniVoice, not a remote URL the deploy target can use.
 * Note: an HTTPS app page may block `http://127.0.0.1` (mixed content); then caller falls back to /api.
 */
export function isOmnivoiceLoopbackBaseUrl(urlStr: string | undefined | null): boolean {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * @returns `Blob` on success, `null` if this path is not used or the request should fall back to GET /api/session/narration-tts
 */
export async function tryFetchOmnivoiceWavInBrowser(
  config: NarrationTtsClientConfig,
  transcript: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  if (effectiveNarrationProvider(config) !== 'omnivoice') return null;
  const baseRaw = config.localBaseUrl?.trim();
  if (!baseRaw || !isOmnivoiceLoopbackBaseUrl(baseRaw)) return null;
  if (!transcript || transcript.length < 1) return null;

  const o = config.omnivoice;
  const responseFormat = o?.responseFormat === 'pcm' ? 'pcm' : 'wav';
  const parts =
    responseFormat === 'wav' && transcript.length > OMNIVOICE_SPLIT_AT_CHARS
      ? splitTextForOmnivoiceChunks(transcript, OMNIVOICE_SPLIT_AT_CHARS)
      : [transcript];
  if (parts.length > 1) {
    return null;
  }

  const base = normalizeBaseUrl(baseRaw);
  const body = buildOmnivoiceSpeechRequestBody(parts[0]!, o, responseFormat);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'audio/*, application/json',
  };
  if (o?.apiKey?.trim()) headers.Authorization = `Bearer ${o.apiKey.trim()}`;

  const url = new URL('/v1/audio/speech', `${base}/`);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), SYNTH_TIMEOUT_MS);
  const onAbort = () => ac.abort();
  signal.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (typeof console !== 'undefined') {
        console.warn(
          '[narration-tts] local OmniVoice (browser) error',
          res.status,
          errBody.slice(0, 500),
        );
      }
      return null;
    }
    const b = await res.blob();
    return b.size >= 32 ? b : null;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return null;
    if (typeof console !== 'undefined') {
      console.warn(
        '[narration-tts] local OmniVoice (browser) fetch failed; will try /api (same machine only works in dev, or if mixed content blocks local http)',
        e,
      );
    }
    return null;
  } finally {
    clearTimeout(t);
    signal.removeEventListener('abort', onAbort);
  }
}
