import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { chatterboxVoiceMemoryFingerprint } from '@/lib/narration/chatterbox-npc-voice-memory';
import {
  narrationTtsCachedAccess,
  narrationTtsCachedSynthesisContext,
} from '@/lib/narration/narration-tts-request-cache';
import { plainTextForNarrationTts } from '@/lib/narration/plain-text-for-tts';
import {
  narrationTtsConfigFingerprint,
} from '@/lib/narration/narration-tts-client-config';
import { synthesizeNarrationAudio } from '@/lib/narration/synthesize-narration-audio';
import { persistChatterboxNpcVoiceMemoryIfChanged } from '@/lib/session/persist-chatterbox-npc-voice-memory';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { uploadNarrationTtsForMessage } from '@/lib/storage/narration-tts-audio';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { z } from 'zod';

export const maxDuration = 120;

const uuid = z.string().uuid();

const prepareBodySchema = z.object({
  sessionId: uuid,
  messageId: uuid,
});

const TTS_CACHE_MAX = 32;
const ttsPrepareCache = new Map<string, { audioUrl: string; mimeType: string }>();

function cacheSetPrepare(key: string, v: { audioUrl: string; mimeType: string }) {
  if (ttsPrepareCache.size >= TTS_CACHE_MAX) {
    const first = ttsPrepareCache.keys().next().value;
    if (first) ttsPrepareCache.delete(first);
  }
  ttsPrepareCache.set(key, v);
}

/**
 * Synthesize narration once, upload to Storage, return signed URL for broadcast to all clients.
 */
export async function POST(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;
  const parsed = prepareBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/session/narration-tts/prepare:body');
  }

  const { sessionId, messageId } = parsed.data;
  const supabase = getServiceRoleClient();
  if (!(await narrationTtsCachedAccess(supabase, sessionId, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from('chat_messages')
    .select('id, session_id, text, type, speaker')
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
  const messageSpeaker = String((row as { speaker?: string }).speaker ?? 'Game Master');
  const transcript = plainTextForNarrationTts(rawText);
  if (!transcript) {
    return NextResponse.json({ error: 'Nothing to speak after stripping markup' }, { status: 400 });
  }
  if (transcript.length > 12_000) {
    return NextResponse.json({ error: 'Narration too long for TTS' }, { status: 400 });
  }

  const { config: ttsConfig, memory: voiceMemIn } = await narrationTtsCachedSynthesisContext(supabase, sessionId);
  const configFp = narrationTtsConfigFingerprint(ttsConfig);
  const memFp = chatterboxVoiceMemoryFingerprint(voiceMemIn);
  const textHash = createHash('sha256').update(transcript, 'utf8').digest('hex').slice(0, 24);
  const cacheKey = `prepare:${messageId}:${configFp}:${memFp}:${textHash}`;
  const hit = ttsPrepareCache.get(cacheKey);
  if (hit) {
    return NextResponse.json({
      audioUrl: hit.audioUrl,
      mimeType: hit.mimeType,
      cached: true,
    });
  }

  const synth = await synthesizeNarrationAudio(
    transcript,
    ttsConfig,
    {
      sessionId,
      label: 'prepare',
      messageSpeaker,
    },
    { chatterboxVoiceMemory: voiceMemIn },
  );
  if (!synth.ok) {
    reportServerError('api/session/narration-tts/prepare', new Error(synth.error), { sessionId });
    return NextResponse.json(
      synth.detail ? { error: synth.error, detail: synth.detail } : { error: synth.error },
      { status: synth.status },
    );
  }

  const { audioUrl, error: upErr } = await uploadNarrationTtsForMessage(supabase, {
    sessionId,
    messageId,
    buffer: synth.buffer,
    mimeType: synth.mimeType,
  });

  if (upErr || !audioUrl) {
    reportServerError(
      'api/session/narration-tts/prepare:upload',
      upErr ?? new Error('upload failed'),
      { sessionId },
    );
    return NextResponse.json(
      {
        error: 'Could not store narration audio',
        detail: upErr?.message ?? 'Upload failed — create Storage bucket `narration-tts` (see migrations/021).',
      },
      { status: 503 },
    );
  }

  if (synth.chatterboxVoiceMemoryOut) {
    try {
      await persistChatterboxNpcVoiceMemoryIfChanged(supabase, sessionId, synth.chatterboxVoiceMemoryOut);
    } catch (e) {
      reportServerError('api/session/narration-tts/prepare:memory', e instanceof Error ? e : new Error(String(e)), {
        sessionId,
      });
    }
  }

  cacheSetPrepare(cacheKey, { audioUrl, mimeType: synth.mimeType });

  return NextResponse.json({
    audioUrl,
    mimeType: synth.mimeType,
    cached: false,
  });
}
