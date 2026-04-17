import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSettings } from '../types';
import { useGameStore } from '../store/game-store';

/**
 * Writes voice UI mode into `sessions.settings` so late joiners and refreshes see the same mode.
 * Call after local `applySessionRecordingBroadcast` + broadcast (same user gesture path).
 */
export async function persistSessionVoiceSettings(
  client: SupabaseClient,
  sessionId: string,
  patch: Pick<SessionSettings, 'voiceInputMode' | 'sessionRecordingStartedBy'>,
): Promise<{ error: Error | null }> {
  const prev = useGameStore.getState().session.settings;
  const merged: SessionSettings = { ...prev, ...patch };
  const { error } = await client.from('sessions').update({ settings: merged }).eq('id', sessionId);
  if (error) return { error: new Error(error.message) };
  useGameStore.getState().updateSessionSettings(patch);
  return { error: null };
}
