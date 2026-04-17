import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionMapState } from '../map/map-state';
import { useGameStore } from '../store/game-store';

export async function persistSessionMapState(
  client: SupabaseClient,
  sessionId: string,
  mapState: SessionMapState,
): Promise<{ error: Error | null }> {
  const { error } = await client.from('sessions').update({ map_state: mapState }).eq('id', sessionId);
  if (error) return { error: new Error(error.message) };
  useGameStore.getState().setMapCoverRegions(mapState.coverRegions);
  return { error: null };
}
