import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSettings } from '../types';
import { useGameStore } from '../store/game-store';

export async function persistSessionMapGridSettings(
  client: SupabaseClient,
  sessionId: string,
  patch: Partial<
    Pick<SessionSettings, 'mapGridCols' | 'mapGridRows' | 'mapShowGrid' | 'mapSnapToGrid' | 'mapMetersPerSquare'>
  >,
): Promise<{ error: Error | null }> {
  const prev = useGameStore.getState().session.settings;
  const merged: SessionSettings = { ...prev, ...patch };
  const { error } = await client.from('sessions').update({ settings: merged }).eq('id', sessionId);
  if (error) return { error: new Error(error.message) };
  useGameStore.getState().updateSessionSettings(patch);
  return { error: null };
}
