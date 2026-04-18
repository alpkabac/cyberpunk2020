import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { plainTextForNarrationTts } from '@/lib/narration/plain-text-for-tts';
import {
  chunkTtsCacheKey,
  getCachedChunkWav,
  setCachedChunkWav,
  synthesizeCartesiaNarrationWav,
} from '@/lib/narration/cartesia-tts';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
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

  const synth = await synthesizeCartesiaNarrationWav(transcript, { sessionId, label: 'message-tts' });
  if (!synth.ok) {
    return NextResponse.json(
      synth.detail ? { error: synth.error, detail: synth.detail } : { error: synth.error },
      { status: synth.status },
    );
  }
  cacheSet(cacheKey, synth.buffer);

  return new NextResponse(new Uint8Array(synth.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

const narrationTtsChunkBodySchema = z.object({
  sessionId: uuid,
  text: z.string().min(1).max(4000),
});

/**
 * POST WAV for arbitrary narration text (streaming / sentence chunks). Requires session access.
 */
export async function POST(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;
  const parsed = narrationTtsChunkBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/session/narration-tts:chunk-body');
  }

  const { sessionId, text } = parsed.data;
  const supabase = getServiceRoleClient();
  if (!(await userHasSessionAccess(supabase, sessionId, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const transcript = plainTextForNarrationTts(text);
  if (!transcript || transcript.length < 2) {
    return NextResponse.json({ error: 'Nothing to speak after stripping markup' }, { status: 400 });
  }

  const cacheKey = chunkTtsCacheKey(sessionId, transcript);
  const hit = getCachedChunkWav(cacheKey);
  if (hit) {
    return new NextResponse(new Uint8Array(hit), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  const synth = await synthesizeCartesiaNarrationWav(transcript, { sessionId, label: 'chunk-tts' });
  if (!synth.ok) {
    reportServerError('api/session/narration-tts:chunk', new Error(synth.error), { sessionId });
    return NextResponse.json(
      synth.detail ? { error: synth.error, detail: synth.detail } : { error: synth.error },
      { status: synth.status },
    );
  }
  setCachedChunkWav(cacheKey, synth.buffer);

  return new NextResponse(new Uint8Array(synth.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
