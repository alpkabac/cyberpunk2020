import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionMapState } from '../map/map-state';
import { useGameStore } from '../store/game-store';

/**
 * Merges `patch` with the current store map (so callers can update only cover or only suppressive).
 * Persists full map_state fields to `sessions.map_state`.
 */
export async function persistSessionMapState(
  client: SupabaseClient,
  sessionId: string,
  patch: Partial<SessionMapState>,
): Promise<{ error: Error | null }> {
  const m = useGameStore.getState().map;
  const mapState: SessionMapState = {
    coverRegions: patch.coverRegions ?? m.coverRegions,
    suppressiveZones: patch.suppressiveZones ?? m.suppressiveZones,
    pendingSuppressivePlacements:
      patch.pendingSuppressivePlacements !== undefined
        ? patch.pendingSuppressivePlacements
        : m.pendingSuppressivePlacements,
  };
  const { error } = await client.from('sessions').update({ map_state: mapState }).eq('id', sessionId);
  if (error) return { error: new Error(error.message) };
  useGameStore.getState().applySessionMapState(mapState);
  return { error: null };
}
