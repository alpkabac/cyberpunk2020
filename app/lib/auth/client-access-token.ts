import type { SupabaseClient } from '@supabase/supabase-js';

export async function getAccessTokenForApi(client: SupabaseClient): Promise<string | null> {
  const {
    data: { session },
  } = await client.auth.getSession();
  return session?.access_token ?? null;
}
