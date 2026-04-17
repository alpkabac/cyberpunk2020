import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSettings } from '../types';
import { parseSessionSettingsJson } from '../realtime/db-mapper';

export async function fetchSessionSettings(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionSettings> {
  const { data, error } = await supabase.from('sessions').select('settings').eq('id', sessionId).maybeSingle();
  if (error || !data) return parseSessionSettingsJson(null);
  return parseSessionSettingsJson((data as { settings?: unknown }).settings);
}
