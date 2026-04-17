import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * True if the user created the session or has a character row linked to them in it.
 * Aligns with `is_user_in_session` RLS helper (service-role bypass on the server).
 */
export async function userHasSessionAccess(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const { data: sessionRow, error: sErr } = await admin
    .from('sessions')
    .select('created_by')
    .eq('id', sessionId)
    .maybeSingle();

  if (sErr || !sessionRow) return false;
  if (sessionRow.created_by === userId) return true;

  const { data: chars, error: cErr } = await admin
    .from('characters')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .limit(1);

  if (cErr) return false;
  return (chars?.length ?? 0) > 0;
}
