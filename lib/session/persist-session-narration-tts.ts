import type { SupabaseClient } from '@supabase/supabase-js';
import type { NarrationTtsClientConfig } from '@/lib/narration/narration-tts-client-config';
import type { SessionSettings } from '../types';
import { useGameStore } from '../store/game-store';

export async function persistSessionNarrationTts(
  client: SupabaseClient,
  sessionId: string,
  narrationTts: NarrationTtsClientConfig,
): Promise<{ error: Error | null }> {
  const prev = useGameStore.getState().session.settings;
  const merged: SessionSettings = { ...prev, narrationTts };
  const { error } = await client.from('sessions').update({ settings: merged }).eq('id', sessionId);
  if (error) return { error: new Error(error.message) };
  useGameStore.getState().updateSessionSettings({ narrationTts });
  return { error: null };
}
