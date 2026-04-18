import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { plainTextForNarrationTts } from '@/lib/narration/plain-text-for-tts';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { z } from 'zod';

export const maxDuration = 120;

const uuid = z.string().uuid();

const TTS_CACHE_MAX = 32;
/** In-process LRU-ish cache: same message text → same audio (best-effort on serverless). */
const ttsCache = new Map<string, Buffer>();

function cacheSet(key: string, buf: Buffer) {
  if (ttsCache.size >= TTS_CACHE_MAX) {
    const first = ttsCache.keys().next().value;
    if (first) ttsCache.delete(first);
  }
  ttsCache.set(key, buf);
}

function getCartesiaApiKey(): string | null {
  const k = process.env.CARTESIA_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

function defaultVoiceId(): string {
  return (
    process.env.CARTESIA_VOICE_ID?.trim() || 'fa7bfcdc-603c-4bf1-a600-a371400d2f8c'
  );
}

/**
 * GET WAV audio for a narration chat line (Cartesia). Requires session access.
 */
export async function GET(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sessionParsed = uuid.safeParse(url.searchParams.get('sessionId'));
  const messageParsed = uuid.safeParse(url.searchParams.get('messageId'));
  if (!sessionParsed.success || !messageParsed.success) {
    return NextResponse.json(
      { error: 'sessionId and messageId (uuid) required' },
      { status: 400 },
    );
  }

  const sessionId = sessionParsed.data;
  const messageId = messageParsed.data;

  const supabase = getServiceRoleClient();
  if (!(await userHasSessionAccess(supabase, sessionId, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from('chat_messages')
    .select('id, session_id, text, type')
    .eq('id', messageId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  if ((row as { type?: string }).type !== 'narration') {
    return NextResponse.json({ error: 'Only narration messages can be read aloud' }, { status: 400 });
  }

  const rawText = String((row as { text?: string }).text ?? '');
  const transcript = plainTextForNarrationTts(rawText);
  if (!transcript) {
    return NextResponse.json({ error: 'Nothing to speak after stripping markup' }, { status: 400 });
  }
  if (transcript.length > 12_000) {
    return NextResponse.json({ error: 'Narration too long for TTS' }, { status: 400 });
  }

  const textHash = createHash('sha256').update(transcript, 'utf8').digest('hex').slice(0, 24);
  const cacheKey = `${messageId}:${textHash}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    return new NextResponse(new Uint8Array(cached), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  const apiKey = getCartesiaApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Set CARTESIA_API_KEY in .env.local (server-side). Optional: CARTESIA_VOICE_ID, CARTESIA_MODEL_ID.',
      },
      { status: 503 },
    );
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
      reportServerError('api/session/narration-tts:cartesia', new Error(errBody || cartesiaRes.statusText), {
        status: cartesiaRes.status,
        sessionId,
        messageId,
      });
      return NextResponse.json(
        { error: 'TTS provider error', detail: errBody.slice(0, 500) },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await cartesiaRes.arrayBuffer());
    if (buf.length < 64) {
      return NextResponse.json({ error: 'TTS returned empty audio' }, { status: 502 });
    }
    cacheSet(cacheKey, buf);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    reportServerError('api/session/narration-tts', e, { sessionId, messageId });
    return NextResponse.json({ error: 'TTS request failed' }, { status: 500 });
  }
}
