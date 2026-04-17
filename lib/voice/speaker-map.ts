/**
 * Map a Deepgram diarization speaker index (0-based) to a character id using a session-local map.
 */
export function mapSpeakerIndexToCharacterId(
  speakerIndex: number,
  map: Record<string, string>,
): string | undefined {
  const id = map[String(speakerIndex)];
  return id?.trim() || undefined;
}
