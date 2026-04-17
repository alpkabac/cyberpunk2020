export interface VoiceSegment {
  speaker: number;
  text: string;
}

export interface ParsedPrerecordedTranscription {
  transcript: string;
  segments: VoiceSegment[];
}

/**
 * Normalizes Deepgram prerecorded (REST) JSON into transcript + per-speaker segments.
 */
export function parseDeepgramPrerecordedResult(raw: unknown): ParsedPrerecordedTranscription {
  const root = raw as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
      utterances?: Array<{ speaker: number; transcript: string }>;
    };
  };

  const alt = root.results?.channels?.[0]?.alternatives?.[0];
  const full = (alt?.transcript ?? '').trim();

  const utterances = root.results?.utterances;
  if (utterances && utterances.length > 0) {
    const segments: VoiceSegment[] = utterances.map((u) => ({
      speaker: u.speaker,
      text: (u.transcript ?? '').trim(),
    }));
    const joined = segments.map((s) => s.text).filter(Boolean).join(' ').trim();
    return {
      transcript: joined || full,
      segments,
    };
  }

  return {
    transcript: full,
    segments: full ? [{ speaker: 0, text: full }] : [],
  };
}
