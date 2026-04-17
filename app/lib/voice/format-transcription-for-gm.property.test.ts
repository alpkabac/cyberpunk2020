import fc from 'fast-check';
import { describe, it } from 'vitest';
import { buildGmVoicePlayerMessage } from './format-transcription-for-gm';

describe('Property 4: Transcription Message Format', () => {
  it('includes transcript text and character identity in the GM player message', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 48 }),
        (transcript, characterId, displayName) => {
          const { playerMessage, metadata } = buildGmVoicePlayerMessage({
            transcript,
            characterId,
            characterDisplayName: displayName,
          });
          const hasTranscript = transcript.trim().length === 0 || playerMessage.includes(transcript.trim());
          const hasId = playerMessage.includes(characterId) && metadata.characterId === characterId;
          const hasName = playerMessage.includes(displayName.trim());
          return hasTranscript && hasId && hasName && metadata.voice === true;
        },
      ),
      { numRuns: 120 },
    );
  });
});
