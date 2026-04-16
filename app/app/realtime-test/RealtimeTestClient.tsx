'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  BROADCAST_EVENTS,
  connectSessionRealtime,
  attachSessionRealtimeRecovery,
  fetchSessionSnapshot,
} from '@/lib/realtime';
import { createDefaultPostgresHandlersForGameStore } from '@/lib/realtime/apply-realtime-to-store';
import { useGameStore } from '@/lib/store/game-store';
import type { SessionRealtimeHandle } from '@/lib/realtime/session-channel';
import { isValidSessionUuid, setDevSessionId } from '@/lib/dev/dev-session-storage';

const TAB_LABEL_KEY = 'realtime-test-tab-label';
const noopSubscribe = () => () => {};
function getTabLabel(): string {
  let v = sessionStorage.getItem(TAB_LABEL_KEY);
  if (!v) {
    v = `tab-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(TAB_LABEL_KEY, v);
  }
  return v;
}

export function RealtimeTestClient() {
  const searchParams = useSearchParams();
  const sessionFromUrl = searchParams.get('session');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [sessionIdInput, setSessionIdInput] = useState(sessionFromUrl ?? '');
  const [sessionId, setSessionId] = useState<string | null>(sessionFromUrl);

  const [subscribeStatus, setSubscribeStatus] = useState<string>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastBroadcast, setLastBroadcast] = useState<{ event: string; payload: unknown; at: number } | null>(null);

  const [chatText, setChatText] = useState('');
  const [sceneNote, setSceneNote] = useState('');
  const [charName, setCharName] = useState('Tab Tester');

  const tabLabel = useSyncExternalStore(noopSubscribe, getTabLabel, () => 'tab');

  const handleRef = useRef<SessionRealtimeHandle | null>(null);
  const recoveryCleanupRef = useRef<(() => void) | null>(null);

  const messages = useGameStore((s) => s.chat.messages);
  const sessionName = useGameStore((s) => s.session.name);
  const sessionSummary = useGameStore((s) => s.session.sessionSummary);
  const characters = useGameStore(
    useShallow((s) => s.characters.allIds.map((id) => s.characters.byId[id])),
  );
  const tokens = useGameStore((s) => s.map.tokens);

  const tabId = tabLabel;

  const [prevSessionFromUrl, setPrevSessionFromUrl] = useState(sessionFromUrl);
  if (sessionFromUrl !== prevSessionFromUrl) {
    setPrevSessionFromUrl(sessionFromUrl);
    if (sessionFromUrl) {
      setSessionIdInput(sessionFromUrl);
      setSessionId(sessionFromUrl);
    }
  }
  useEffect(() => {
    if (sessionFromUrl && isValidSessionUuid(sessionFromUrl)) {
      setDevSessionId(sessionFromUrl);
    }
  }, [sessionFromUrl]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      useGameStore.getState().reset();
    }
  }, [sessionId]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !sessionId) return '';
    return `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(sessionId)}`;
  }, [sessionId]);

  const applySessionFromInput = () => {
    const trimmed = sessionIdInput.trim();
    if (!trimmed) {
      setSessionId(null);
      return;
    }
    setSessionId(trimmed);
    setDevSessionId(trimmed);
    const url = new URL(window.location.href);
    url.searchParams.set('session', trimmed);
    window.history.replaceState({}, '', url.toString());
  };

  const userId = user?.id;

  const connectRealtime = useCallback(async () => {
    if (!sessionId || !userId) return;
    setLastError(null);
    recoveryCleanupRef.current?.();
    recoveryCleanupRef.current = null;
    await handleRef.current?.dispose();
    handleRef.current = null;

    const refreshFromDatabase = async () => {
      const snap = await fetchSessionSnapshot(supabase, sessionId);
      if (snap) {
        useGameStore.getState().hydrateFromLoadedSnapshot(snap);
      }
    };

    try {
      const handle = await connectSessionRealtime(supabase, {
        sessionId,
        refreshFromDatabase,
        postgresHandlers: createDefaultPostgresHandlersForGameStore(),
        onSubscribeStatus: (status) => setSubscribeStatus(status),
        onBroadcast: (event, payload) => {
          setLastBroadcast({ event, payload, at: Date.now() });
        },
      });
      handleRef.current = handle;
      recoveryCleanupRef.current = attachSessionRealtimeRecovery(handle);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setSubscribeStatus('error');
    }
  }, [sessionId, userId]);

  const connKey = `${sessionId ?? ''}|${userId ?? ''}`;
  const [prevConnKey, setPrevConnKey] = useState<string | null>(null);
  if (connKey !== prevConnKey) {
    setPrevConnKey(connKey);
    if (!sessionId || !userId) {
      setSubscribeStatus('idle');
    }
  }

  useEffect(() => {
    if (!sessionId || !userId) return;
    let cancelled = false;
    void (async () => {
      await connectRealtime();
      if (cancelled) {
        recoveryCleanupRef.current?.();
        recoveryCleanupRef.current = null;
        await handleRef.current?.dispose();
        handleRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
      recoveryCleanupRef.current?.();
      recoveryCleanupRef.current = null;
      void handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [sessionId, userId, connectRealtime]);

  const signIn = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError(error.message);
  };

  const signUp = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) setAuthError(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSessionId(null);
    setSessionIdInput('');
  };

  const createSession = async () => {
    if (!user) return;
    setLastError(null);
    const { data, error } = await supabase
      .from('sessions')
      .insert({ name: `Realtime test ${tabId}`, created_by: user.id })
      .select('id')
      .single();
    if (error) {
      setLastError(error.message);
      return;
    }
    if (data?.id) {
      setSessionId(data.id);
      setSessionIdInput(data.id);
      setDevSessionId(data.id);
      const url = new URL(window.location.href);
      url.searchParams.set('session', data.id);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const sendChat = async () => {
    if (!sessionId || !user || !chatText.trim()) return;
    const { error } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      speaker: `${tabId} (${user.email ?? user.id.slice(0, 8)})`,
      text: chatText.trim(),
      type: 'player',
    });
    if (error) setLastError(error.message);
    else setChatText('');
  };

  const updateSessionSummary = async () => {
    if (!sessionId) return;
    const note = sceneNote.trim() || `Ping from ${tabId} @ ${new Date().toISOString()}`;
    const { error } = await supabase
      .from('sessions')
      .update({ session_summary: note })
      .eq('id', sessionId);
    if (error) setLastError(error.message);
  };

  const ensureCharacter = async (): Promise<string | null> => {
    if (!sessionId || !user) return null;
    if (characters.length > 0) return characters[0].id;
    const { data, error } = await supabase
      .from('characters')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        name: charName || 'Tab Tester',
        type: 'character',
      })
      .select('id')
      .single();
    if (error) {
      setLastError(error.message);
      return null;
    }
    return data?.id ?? null;
  };

  const updateCharacterName = async () => {
    const cid = await ensureCharacter();
    if (!cid || !charName.trim()) return;
    useGameStore.getState().beginOptimisticCharacterEdit(cid);
    const { error } = await supabase.from('characters').update({ name: charName.trim() }).eq('id', cid);
    if (error) {
      useGameStore.getState().rollbackOptimisticCharacterEdit(cid);
      setLastError(error.message);
    } else {
      useGameStore.getState().clearOptimisticCharacterBackup(cid);
    }
  };

  const ensureGmToken = async (): Promise<string | null> => {
    if (!sessionId) return null;
    const gm = tokens.find((t) => t.controlledBy === 'gm');
    if (gm) return gm.id;
    const { data, error } = await supabase
      .from('tokens')
      .insert({
        session_id: sessionId,
        character_id: null,
        name: `GM ${tabId}`,
        x: 15,
        y: 15,
        size: 44,
        controlled_by: 'gm',
      })
      .select('id')
      .single();
    if (error) {
      setLastError(error.message);
      return null;
    }
    return data?.id ?? null;
  };

  const nudgeToken = async () => {
    const tid = await ensureGmToken();
    if (!tid || !sessionId) return;
    const t = useGameStore.getState().map.tokens.find((x) => x.id === tid);
    const nx = Math.min(100, (t?.x ?? 20) + 7);
    const ny = Math.min(100, (t?.y ?? 20) + 3);
    const { error } = await supabase.from('tokens').update({ x: nx, y: ny }).eq('id', tid);
    if (error) setLastError(error.message);
  };

  const sendTypingBroadcast = async () => {
    const h = handleRef.current;
    if (!h) return;
    try {
      await h.sendBroadcast(BROADCAST_EVENTS.TYPING, {
        from: tabId,
        at: Date.now(),
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10 font-mono text-sm">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex flex-col gap-2 border-b border-zinc-800 pb-6">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <h1 className="text-xl md:text-2xl text-cyan-400 tracking-tight">Realtime multiplayer test</h1>
            <div className="flex gap-4 text-sm">
              <Link href="/dev" className="text-zinc-500 hover:text-cyan-400 underline">
                Dev hub
              </Link>
              <Link href="/" className="text-zinc-500 hover:text-cyan-400 underline">
                Home
              </Link>
            </div>
          </div>
          <p className="text-zinc-400 max-w-2xl">
            Sign in (same account in both tabs is fine). Create or paste a session ID, then open this URL in a second tab.
            Use the actions below; the other tab should update within a second via Supabase Realtime.
          </p>
          <p className="text-amber-400/90">
            This tab:{' '}
            <span className="text-amber-200" suppressHydrationWarning>
              {tabLabel}
            </span>
          </p>
        </header>

        {!user ? (
          <section className="space-y-4 border border-zinc-800 rounded-lg p-6 bg-zinc-900/50">
            <h2 className="text-cyan-300 uppercase tracking-wider text-xs">Auth</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-zinc-500 text-xs">Email</span>
                <input
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-500 text-xs">Password</span>
                <input
                  type="password"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </div>
            {authError && <p className="text-red-400">{authError}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void signIn()}
                className="bg-cyan-700 hover:bg-cyan-600 text-white px-4 py-2 rounded border border-cyan-500/50"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => void signUp()}
                className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded border border-zinc-600"
              >
                Sign up
              </button>
            </div>
          </section>
        ) : (
          <section className="space-y-4 border border-zinc-800 rounded-lg p-6 bg-zinc-900/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-cyan-300 uppercase tracking-wider text-xs">Signed in</h2>
                <p className="text-zinc-300 truncate max-w-md">{user.email ?? user.id}</p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-zinc-500 hover:text-zinc-300 underline text-xs"
              >
                Sign out
              </button>
            </div>

            <div className="space-y-2">
              <h2 className="text-cyan-300 uppercase tracking-wider text-xs">Session</h2>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  className="flex-1 min-w-[12rem] bg-zinc-950 border border-zinc-700 rounded px-3 py-2"
                  placeholder="Session UUID"
                  value={sessionIdInput}
                  onChange={(e) => setSessionIdInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={applySessionFromInput}
                  className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded border border-zinc-600"
                >
                  Use ID
                </button>
                <button
                  type="button"
                  onClick={() => void createSession()}
                  className="bg-emerald-800 hover:bg-emerald-700 px-3 py-2 rounded border border-emerald-600/50"
                >
                  Create session
                </button>
              </div>
              {sessionId && shareUrl && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 break-all">Active: {sessionId}</p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-violet-900/40 hover:bg-violet-800/50 border border-violet-600/40 px-3 py-2 rounded text-violet-200"
                    >
                      Open second tab (same session)
                    </a>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(shareUrl)}
                      className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-zinc-500">Realtime status: </span>
                <span className={subscribeStatus === 'SUBSCRIBED' ? 'text-emerald-400' : 'text-yellow-400'}>
                  {subscribeStatus}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Session row (store): </span>
                <span className="text-zinc-300">{sessionName || '—'}</span>
              </div>
            </div>
            {lastError && <p className="text-red-400 text-xs">{lastError}</p>}
            {lastBroadcast && (
              <p className="text-xs text-violet-300">
                Last broadcast: {lastBroadcast.event} {JSON.stringify(lastBroadcast.payload)} @{' '}
                {new Date(lastBroadcast.at).toLocaleTimeString()}
              </p>
            )}
          </section>
        )}

        {user && sessionId && (
          <section className="space-y-6 border border-zinc-800 rounded-lg p-6 bg-zinc-900/30">
            <h2 className="text-cyan-300 uppercase tracking-wider text-xs">Actions (write to Postgres)</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 border border-zinc-800 rounded p-4">
                <h3 className="text-zinc-400 text-xs uppercase">Chat</h3>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Message"
                    onKeyDown={(e) => e.key === 'Enter' && void sendChat()}
                  />
                  <button
                    type="button"
                    onClick={() => void sendChat()}
                    className="bg-cyan-900/50 hover:bg-cyan-800/50 border border-cyan-700/50 px-3 py-2 rounded"
                  >
                    Send
                  </button>
                </div>
              </div>

              <div className="space-y-2 border border-zinc-800 rounded p-4">
                <h3 className="text-zinc-400 text-xs uppercase">Session summary row</h3>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2"
                    value={sceneNote}
                    onChange={(e) => setSceneNote(e.target.value)}
                    placeholder="Optional note (or auto timestamp)"
                  />
                  <button
                    type="button"
                    onClick={() => void updateSessionSummary()}
                    className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-3 py-2 rounded"
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-zinc-500 truncate">Store summary: {sessionSummary || '—'}</p>
              </div>

              <div className="space-y-2 border border-zinc-800 rounded p-4">
                <h3 className="text-zinc-400 text-xs uppercase">Character name (optimistic + DB)</h3>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2"
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void updateCharacterName()}
                    className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-3 py-2 rounded"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  Characters: {characters.map((c) => c.name).join(', ') || 'none — Save creates one'}
                </p>
              </div>

              <div className="space-y-2 border border-zinc-800 rounded p-4">
                <h3 className="text-zinc-400 text-xs uppercase">GM token move</h3>
                <button
                  type="button"
                  onClick={() => void nudgeToken()}
                  className="bg-amber-900/40 hover:bg-amber-800/40 border border-amber-700/50 px-3 py-2 rounded w-full"
                >
                  Nudge GM token (+x/+y)
                </button>
                <p className="text-xs text-zinc-500">
                  Tokens:{' '}
                  {tokens.map((t) => `${t.name}@(${t.x.toFixed(0)},${t.y.toFixed(0)})`).join(' · ') || 'none'}
                </p>
              </div>

              <div className="space-y-2 border border-zinc-800 rounded p-4 md:col-span-2">
                <h3 className="text-zinc-400 text-xs uppercase">Broadcast only (not stored)</h3>
                <button
                  type="button"
                  onClick={() => void sendTypingBroadcast()}
                  className="bg-violet-900/40 hover:bg-violet-800/40 border border-violet-600/40 px-3 py-2 rounded"
                >
                  Send typing broadcast
                </button>
              </div>
            </div>
          </section>
        )}

        {user && sessionId && (
          <section className="space-y-2 border border-zinc-800 rounded-lg p-6 bg-black/40">
            <h2 className="text-cyan-300 uppercase tracking-wider text-xs">Chat log (Zustand, synced via Realtime)</h2>
            <ul className="space-y-2 max-h-80 overflow-y-auto text-xs">
              {messages.length === 0 ? (
                <li className="text-zinc-600">No messages yet.</li>
              ) : (
                messages.map((m) => (
                  <li key={m.id} className="border-l-2 border-zinc-700 pl-3">
                    <span className="text-zinc-500">{new Date(m.timestamp).toLocaleTimeString()}</span>{' '}
                    <span className="text-cyan-600">{m.speaker}</span>: {m.text}
                  </li>
                ))
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
