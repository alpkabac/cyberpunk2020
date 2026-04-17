import { createClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { parseBearerToken } from '@/lib/auth/bearer';

export type RequireAuthResult =
  | { ok: true; user: User; accessToken: string }
  | { ok: false; response: NextResponse };

/**
 * Validates Supabase JWT from `Authorization: Bearer` and returns the user.
 */
export async function requireAuthFromRequest(request: Request): Promise<RequireAuthResult> {
  const token = parseBearerToken(request.headers.get('Authorization'));
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 }),
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server auth configuration error' }, { status: 500 }),
    };
  }

  const client = createClient(url, anonKey);
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    };
  }

  return { ok: true, user, accessToken: token };
}
