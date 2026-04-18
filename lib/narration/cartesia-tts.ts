import { createHash } from 'crypto';
import { reportServerError } from '@/lib/logging/server-report';

const TTS_CACHE_MAX = 64;
const chunkCache = new Map<string, Buffer>();

function cacheSet(key: string, buf: Buffer) {
  if (chunkCache.size >= TTS_CACHE_MAX) {
    const first = chunkCache.keys().next().value;
    if (first) chunkCache.delete(first);
  }
  chunkCache.set(key, buf);
}

function getCartesiaApiKey(): string | null {
  const k = process.env.CARTESIA_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

function defaultVoiceId(): string {
  return process.env.CARTESIA_VOICE_ID?.trim() || 'fa7bfcdc-603c-4bf1-a600-a371400d2f8c';
}

/**
 * Cartesia WAV bytes for a narration transcript (shared by message-based and chunk TTS routes).
 */
export async function synthesizeCartesiaNarrationWav(
  transcript: string,
  logContext?: { sessionId?: string; label?: string },
): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; error: string; detail?: string }> {
  const apiKey = getCartesiaApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error:
        'Set CARTESIA_API_KEY in .env.local (server-side). Optional: CARTESIA_VOICE_ID, CARTESIA_MODEL_ID.',
    };
  }

  const modelId = process.env.CARTESIA_MODEL_ID?.trim() || 'sonic-3';
  const voiceId = defaultVoiceId();

  try {
    const cartesiaRes = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2025-04-16',
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: modelId,
        transcript,
        voice: { mode: 'id', id: voiceId },
        output_format: {
          container: 'wav',
          encoding: 'pcm_f32le',
          sample_rate: 44100,
        },
        speed: 'normal',
        generation_config: {
          speed: 0.9,
          volume: 1,
          emotion: 'calm',
        },
      }),
    });

    if (!cartesiaRes.ok) {
      const errBody = await cartesiaRes.text().catch(() => '');
      reportServerError(
        'cartesia-tts:provider',
        new Error(errBody || cartesiaRes.statusText),
        { status: cartesiaRes.status, ...logContext },
      );
      return {
        ok: false,
        status: 502,
        error: 'TTS provider error',
        detail: errBody.slice(0, 500),
      };
    }

    const buf = Buffer.from(await cartesiaRes.arrayBuffer());
    if (buf.length < 64) {
      return { ok: false, status: 502, error: 'TTS returned empty audio' };
    }
    return { ok: true, buffer: buf };
  } catch (e) {
    reportServerError('cartesia-tts', e, logContext ?? {});
    return { ok: false, status: 500, error: 'TTS request failed' };
  }
}

export function chunkTtsCacheKey(sessionId: string, transcript: string): string {
  const h = createHash('sha256').update(transcript, 'utf8').digest('hex').slice(0, 24);
  return `${sessionId}:chunk:${h}`;
}

export function getCachedChunkWav(key: string): Buffer | undefined {
  return chunkCache.get(key);
}

export function setCachedChunkWav(key: string, buf: Buffer): void {
  cacheSet(key, buf);
}
