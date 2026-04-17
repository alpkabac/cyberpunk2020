import { DeepgramClient } from '@deepgram/sdk';
import { NextResponse } from 'next/server';
import { parseDeepgramPrerecordedResult } from '@/lib/voice/parse-deepgram-prerecorded';
import { mapSpeakerIndexToCharacterId } from '@/lib/voice/speaker-map';
import { getDeepgramApiKeyFromEnv } from '@/lib/voice/stt-env';

export const maxDuration = 120;

export interface VoiceSttSegmentResponse {
  speaker: number;
  text: string;
  characterId?: string;
}

/**
 * POST raw audio body (e.g. audio/webm from MediaRecorder) for server-side STT via Deepgram.
 * Headers:
 * - X-Character-Id: optional — applied when diarization resolves to a single speaker (one mic / one person),
 *   including multiple utterance rows all tagged as the same speaker index.
 * - X-Speaker-Map: optional JSON object mapping speaker index strings ("0","1",…) to character UUIDs (diarization).
 * - X-STT-Language: optional BCP-47 tag (e.g. `tr` for Turkish, `en` for English).
 *   If omitted: query `language` → env `STT_LANGUAGE` → default `en`.
 *   Wrong language vs. your speech produces gibberish (e.g. Turkish audio + `en`).
 */
export async function POST(request: Request) {
  const apiKey = getDeepgramApiKeyFromEnv();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Set DEEPGRAM_API_KEY or STT_API_KEY in app/.env.local (server-side only; never expose in the browser).',
      },
      { status: 503 },
    );
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length < 64) {
    return NextResponse.json({ error: 'Audio body too small or empty' }, { status: 400 });
  }

  const url = new URL(request.url);
  const language =
    request.headers.get('X-STT-Language')?.trim() ||
    url.searchParams.get('language')?.trim() ||
    process.env.STT_LANGUAGE?.trim() ||
    'en';
  const model = process.env.DEEPGRAM_MODEL?.trim() || 'nova-3';

  let speakerMap: Record<string, string> = {};
  const rawMap = request.headers.get('X-Speaker-Map')?.trim();
  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        speakerMap = parsed as Record<string, string>;
      }
    } catch {
      return NextResponse.json({ error: 'Invalid X-Speaker-Map JSON' }, { status: 400 });
    }
  }

  const singleCharacterId = request.headers.get('X-Character-Id')?.trim() || undefined;

  const deepgram = new DeepgramClient({ apiKey });

  try {
    // Aligns with Deepgram live options (e.g. listen.v1.connect): nova-3, language, smart_format.
    const raw = await deepgram.listen.v1.media.transcribeFile(buf, {
      model: model as 'nova-3',
      language,
      punctuate: true,
      smart_format: true,
      diarize: true,
      utterances: true,
    });

    const parsed = parseDeepgramPrerecordedResult(raw);
    const uniqueSpeakers = new Set(parsed.segments.map((s) => s.speaker));
    /** One person talking: one segment *or* several utterances all with the same speaker index. */
    const singleDiarizedSpeaker = uniqueSpeakers.size === 1;

    const segments: VoiceSttSegmentResponse[] = parsed.segments.map((s) => {
      let characterId = mapSpeakerIndexToCharacterId(s.speaker, speakerMap);
      if (characterId === undefined && singleCharacterId && singleDiarizedSpeaker) {
        characterId = singleCharacterId;
      }
      return {
        speaker: s.speaker,
        text: s.text,
        characterId,
      };
    });

    return NextResponse.json({
      transcript: parsed.transcript,
      segments,
      language,
      model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/voice]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
