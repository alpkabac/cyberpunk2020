'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));

  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) setError(err.message);
      else router.push(next);
    } finally {
      setBusy(false);
    }
  }, [email, password, next, router]);

  const signUp = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
      if (err) setError(err.message);
      else {
        setError(null);
        router.push(next);
      }
    } finally {
      setBusy(false);
    }
  }, [email, password, next, router]);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase.auth.signOut();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold uppercase tracking-wide text-cyan-400">Sign in</h1>
          <p className="text-xs text-zinc-500">
            Email / password via Supabase Auth. After sign-in you can use session rooms and API routes that require a
            JWT.
          </p>
        </div>

        {user ? (
          <div className="space-y-3 text-sm">
            <p className="text-emerald-400/90 truncate" title={user.email ?? user.id}>
              Signed in as {user.email ?? user.id}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={next}
                className="inline-flex items-center justify-center px-4 py-2 rounded bg-cyan-800 hover:bg-cyan-700 text-white text-sm"
              >
                Continue
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center justify-center px-4 py-2 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800 text-sm"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="email"
              autoComplete="email"
              placeholder="Email"
              className="w-full bg-zinc-950 border border-zinc-600 rounded px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              className="w-full bg-zinc-950 border border-zinc-600 rounded px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void signIn()}
                className="flex-1 min-w-[120px] bg-cyan-800 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm py-2 rounded"
              >
                Sign in
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signUp()}
                className="flex-1 min-w-[120px] border border-zinc-600 hover:bg-zinc-800 disabled:opacity-50 text-zinc-200 text-sm py-2 rounded"
              >
                Sign up
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-600">
          <Link href="/" className="text-cyan-500 hover:underline">
            ← Home
          </Link>
        </p>
      </div>
    </div>
  );
}
