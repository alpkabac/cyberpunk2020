import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSoundtrackState } from '../types';

export async function persistSessionSoundtrackState(
  supabase: SupabaseClient,
  sessionId: string,
  state: SessionSoundtrackState,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('sessions')
    .update({ soundtrack_state: state })
    .eq('id', sessionId);
  return { error: error ? new Error(error.message) : null };
}
