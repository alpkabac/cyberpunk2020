import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSettings } from '../types';
import { useGameStore } from '../store/game-store';

/** Persists AI-GM OpenRouter model into `sessions.settings` (Realtime sync for all clients). */
export async function persistSessionGmOpenRouterModel(
  client: SupabaseClient,
  sessionId: string,
  patch: Pick<SessionSettings, 'gmOpenRouterModel'>,
): Promise<{ error: Error | null }> {
  const prev = useGameStore.getState().session.settings;
  const merged: SessionSettings = { ...prev, ...patch };
  const { error } = await client.from('sessions').update({ settings: merged }).eq('id', sessionId);
  if (error) return { error: new Error(error.message) };
  useGameStore.getState().updateSessionSettings(patch);
  return { error: null };
}
