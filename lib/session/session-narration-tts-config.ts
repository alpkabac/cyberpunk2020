import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mergeNarrationTtsClientConfig,
  type NarrationTtsClientConfig,
} from '@/lib/narration/narration-tts-client-config';
import { fetchSessionSettings } from '@/lib/session/fetch-session-settings';

/** Room-wide narration TTS params from `sessions.settings` (same for every client). */
export async function getSessionNarrationTtsConfig(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<NarrationTtsClientConfig> {
  const settings = await fetchSessionSettings(supabase, sessionId);
  return mergeNarrationTtsClientConfig(settings.narrationTts);
}
