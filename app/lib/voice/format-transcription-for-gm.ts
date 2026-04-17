import type { VoiceSegment } from './parse-deepgram-prerecorded';

export interface GmVoiceMessagePayload {
  /** Plain text sent as `playerMessage` to `/api/gm` — includes identity markers for the model. */
  playerMessage: string;
  /** Stored on the chat row when the GM route supports metadata passthrough. */
  metadata: { voice: true; characterId?: string; segmentCharacterIds?: string[] };
}

/**
 * Builds the player message for the AI-GM so it always carries both transcript and character identity
 * (Property 4: Transcription Message Format).
 */
export function buildGmVoicePlayerMessage(input: {
  transcript: string;
  characterId: string;
  characterDisplayName: string;
}): GmVoiceMessagePayload {
  const t = input.transcript.trim();
  const id = input.characterId.trim();
  const name = input.characterDisplayName.trim() || 'Player';
  const playerMessage = `[character:${id}] [${name}] ${t}`;
  return {
    playerMessage,
    metadata: { voice: true, characterId: id },
  };
}

/**
 * Multi-speaker path: one line per utterance with explicit character ids when mapped.
 */
export function buildGmVoicePlayerMessageFromSegments(
  segments: Array<VoiceSegment & { characterId?: string }>,
  resolveName: (characterId: string) => string,
): GmVoiceMessagePayload {
  const lines = segments
    .filter((s) => s.text.trim())
    .map((s) => {
      if (s.characterId) {
        const name = resolveName(s.characterId).trim() || 'Player';
        return `[character:${s.characterId}] [${name}] ${s.text.trim()}`;
      }
      return `[speaker:${s.speaker}] ${s.text.trim()}`;
    });
  const playerMessage = lines.join('\n');
  const segmentCharacterIds = segments
    .map((s) => s.characterId)
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
  return {
    playerMessage,
    metadata: {
      voice: true,
      segmentCharacterIds: segmentCharacterIds.length ? segmentCharacterIds : undefined,
    },
  };
}
