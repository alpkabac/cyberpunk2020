import fc from 'fast-check';
import { describe, it } from 'vitest';
import { mapSpeakerIndexToCharacterId } from './speaker-map';

describe('Property 3: Speaker-to-Character Mapping', () => {
  it('maps the same speaker index + map to the same character id (deterministic)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 32 }),
        fc.dictionary(fc.stringMatching(/^[0-9]+$/), fc.string({ minLength: 1, maxLength: 64 }), {
          maxKeys: 12,
        }),
        (speaker, map) => {
          const a = mapSpeakerIndexToCharacterId(speaker, map);
          const b = mapSpeakerIndexToCharacterId(speaker, map);
          return a === b;
        },
      ),
      { numRuns: 120 },
    );
  });

  it('returns the mapped id when the key exists', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 16 }), fc.uuid(), (speaker, charId) => {
        const map = { [String(speaker)]: charId };
        return mapSpeakerIndexToCharacterId(speaker, map) === charId;
      }),
      { numRuns: 120 },
    );
  });
});
