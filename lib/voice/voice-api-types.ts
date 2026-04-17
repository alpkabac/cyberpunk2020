/** JSON body from POST `/api/voice` (success). */
export interface VoiceSttApiResponse {
  transcript: string;
  segments: Array<{
    speaker: number;
    text: string;
    characterId?: string;
  }>;
  language?: string;
  model?: string;
}
