import type { SupabaseClient } from '@supabase/supabase-js';
import { voiceMemoryShallowEqual } from '@/lib/narration/chatterbox-npc-voice-memory';
import { invalidateNarrationTtsSessionCache } from '@/lib/narration/narration-tts-request-cache';
import { fetchSessionSettings } from './fetch-session-settings';

/**
 * Service-role / server: store updated list-order name→row memory after a Chatterbox prep pass.
 */
export async function persistChatterboxNpcVoiceMemoryIfChanged(
  supabase: SupabaseClient,
  sessionId: string,
  next: Record<string, number>,
): Promise<void> {
  const cur = await fetchSessionSettings(supabase, sessionId);
  if (voiceMemoryShallowEqual(cur.chatterboxNpcVoiceMemory, next)) return;
  const merged = { ...cur, chatterboxNpcVoiceMemory: next };
  const { error } = await supabase.from('sessions').update({ settings: merged }).eq('id', sessionId);
  if (error) {
    throw new Error(error.message);
  }
  invalidateNarrationTtsSessionCache(sessionId);
}
