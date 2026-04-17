'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  getDevSessionId,
  getDevSpeakerName,
  isValidSessionUuid,
  setDevSessionId,
  setDevSpeakerName,
} from '@/lib/dev/dev-session-storage';

export function DevSessionHub() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessionId, setSessionId] = useState('');
  const [speakerName, setSpeakerName] = useState('Player');
  const [mounted, setMounted] = useState(false);

  const [prevSearchParams, setPrevSearchParams] = useState<ReturnType<typeof useSearchParams> | null>(null);
  if (searchParams !== prevSearchParams) {
    setPrevSearchParams(searchParams);
    const q = searchParams.get('session')?.trim() ?? '';
    if (q && isValidSessionUuid(q)) {
      setSessionId(q);
    } else if (!prevSearchParams) {
      const s = getDevSessionId();
      if (s) setSessionId(s);
    }
    if (!prevSearchParams) {
      const sp = getDevSpeakerName();
      if (sp) setSpeakerName(sp);
    }
    setMounted(true);
  }

  useEffect(() => {
    const q = searchParams.get('session')?.trim() ?? '';
    if (q && isValidSessionUuid(q)) {
      setDevSessionId(q);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!mounted) return;
    if (sessionId.trim() && isValidSessionUuid(sessionId)) {
      setDevSessionId(sessionId);
    }
  }, [sessionId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    setDevSpeakerName(speakerName);
  }, [speakerName, mounted]);

  const valid = sessionId.trim() !== '' && isValidSessionUuid(sessionId);
  const withSession = (path: string) =>
    valid ? `${path}?session=${encodeURIComponent(sessionId.trim())}` : path;

  const go = () => {
    const id = sessionId.trim();
    if (!isValidSessionUuid(id)) return;
    void router.push(`/session/${id}`);
  };

  const copyId = useCallback(() => {
    if (valid) void navigator.clipboard.writeText(sessionId.trim());
  }, [sessionId, valid]);

  const clearStored = useCallback(() => {
    setSessionId('');
    setDevSessionId('');
  }, []);

  return (
    <div className="space-y-10">
      <header className="space-y-2 border-b border-zinc-800 pb-6">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Development</p>
        <h1 className="text-3xl font-bold text-zinc-100">Session &amp; dev tools</h1>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
          Set your session UUID once — it is saved in this browser. Open the room, character demo, realtime lab, or
          GM scenarios without re-pasting after refresh. Create a new row in the database from{' '}
          <code className="text-cyan-400/90">Realtime test</code> → it will auto-save here too.
        </p>
        <Link href="/" className="inline-block text-sm text-zinc-500 hover:text-cyan-400 underline">
          ← Back to home
        </Link>
      </header>

      <section className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400">Working session</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 md:col-span-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Session ID (UUID)</span>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Paste UUID or create one in Realtime test below"
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white placeholder:text-zinc-600 font-mono"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Speaker name (GM / chat)</span>
            <input
              type="text"
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          Status:{' '}
          {valid ? (
            <span className="text-emerald-400">Valid — quick links are enabled.</span>
          ) : (
            <span className="text-amber-500/90">Invalid or empty — paste a full UUID.</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!valid}
            onClick={go}
            className="bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white px-4 py-2 rounded text-sm font-bold uppercase tracking-wide"
          >
            Open session room
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={copyId}
            className="border border-zinc-600 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 px-4 py-2 rounded text-sm"
          >
            Copy session id
          </button>
          <button type="button" onClick={clearStored} className="text-zinc-500 hover:text-zinc-300 text-sm underline">
            Clear stored id
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href={valid ? withSession('/character-demo') : '/character-demo'}
            className={`text-center border px-4 py-3 rounded text-sm font-bold uppercase tracking-wide transition-colors ${
              valid
                ? 'border-cyan-600/50 bg-cyan-900/40 text-cyan-50 hover:bg-cyan-800/50'
                : 'border-zinc-700 text-zinc-600 pointer-events-none'
            }`}
          >
            Character demo + cloud sheet
          </Link>
          <Link
            href={valid ? withSession('/realtime-test') : '/realtime-test'}
            className={`text-center border px-4 py-3 rounded text-sm font-bold uppercase tracking-wide transition-colors ${
              valid
                ? 'border-violet-500/50 bg-violet-900/50 text-violet-100 hover:bg-violet-800/60'
                : 'border-zinc-700 text-zinc-600 pointer-events-none'
            }`}
          >
            Realtime test (debug)
          </Link>
          <Link
            href={valid ? withSession('/gm-scenarios') : '/gm-scenarios'}
            className={`text-center border px-4 py-3 rounded text-sm font-bold uppercase tracking-wide transition-colors ${
              valid
                ? 'border-emerald-500/50 bg-emerald-900/50 text-emerald-100 hover:bg-emerald-800/60'
                : 'border-zinc-700 text-zinc-600 pointer-events-none'
            }`}
          >
            AI-GM scenarios
          </Link>
          <span className="text-xs text-zinc-500 flex items-center justify-center border border-dashed border-zinc-700 rounded px-2 text-center">
            URLs include <code className="text-zinc-400 mx-1">?session=…</code> when valid
          </span>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-950/20 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-violet-300">Create session &amp; characters</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Sign in, then <strong className="text-zinc-300">Create session</strong> and optionally add a character — the
          new session id is saved to this browser automatically. Two-tab sync and broadcast live here.
        </p>
        <Link
          href={valid ? withSession('/realtime-test') : '/realtime-test'}
          className="inline-block w-full text-center bg-violet-900/80 hover:bg-violet-800 text-violet-100 border-2 border-violet-500/60 px-6 py-3 font-bold uppercase text-sm tracking-wider transition-colors"
        >
          Open realtime test
        </Link>
      </section>

      <section className="space-y-2 text-sm text-zinc-500">
        <p>
          <strong className="text-zinc-400">Canonical play URL:</strong>{' '}
          <code className="text-zinc-400">/session/&lt;uuid&gt;</code> — not the same as realtime-test&apos;s{' '}
          <code className="text-zinc-400">?session=</code> on that page only.
        </p>
        <p>
          Automated tests: <code className="text-cyan-300/80">npm run test:run</code>
        </p>
      </section>
    </div>
  );
}
