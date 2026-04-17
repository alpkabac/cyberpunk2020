'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { CharacterSheet, DiceRoller } from '@/components/character';
import { ChatInterface, ResizableChatPanel } from '@/components/chat';
import { PopoutCharacterSheet } from '@/components/session/PopoutCharacterSheet';
import { MapCanvas } from '@/components/map';
import { supabase } from '@/lib/supabase';
import { useGameStore } from '@/lib/store/game-store';
import { useSessionRealtimeSync } from '@/lib/hooks/useSessionRealtimeSync';
import { useCharacterCloudSync } from '@/lib/hooks/useCharacterCloudSync';
import { useShallow } from 'zustand/react/shallow';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function SessionRoomClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdParam = typeof params.sessionId === 'string' ? params.sessionId : '';
  const sessionId = UUID_RE.test(sessionIdParam) ? sessionIdParam : '';
  const characterParam = searchParams.get('character');

  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetPopout, setSheetPopout] = useState(false);
  const [wideChatLayout, setWideChatLayout] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setWideChatLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const session = useGameStore((s) => s.session);
  const characters = useGameStore(
    useShallow((s) => ({ byId: s.characters.byId, allIds: s.characters.allIds })),
  );
  const npcs = useGameStore(
    useShallow((s) => ({ byId: s.npcs.byId, allIds: s.npcs.allIds })),
  );

  useEffect(() => {
    useGameStore.getState().reset();
  }, [sessionId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const syncKey = `${sessionId}|${user?.id ?? ''}`;
  const [prevSyncKey, setPrevSyncKey] = useState<string | null>(null);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    if (sessionId && user) {
      setCloudHydrated(false);
      setLoadError(null);
    } else if (sessionId) {
      setCloudHydrated(true);
    }
  }

  const onSyncComplete = useCallback(() => {
    setCloudHydrated(true);
    const s = useGameStore.getState().session;
    if (s.id !== sessionId) {
      setLoadError('Session not found or you do not have access.');
    }
  }, [sessionId]);

  useSessionRealtimeSync(supabase, sessionId || null, user?.id, onSyncComplete);

  const selectCharacter = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSheetPopout(false);
      router.replace(`/session/${sessionId}?character=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router, sessionId],
  );

  const allPlayableIds = useMemo(() => {
    const ids = [...characters.allIds, ...npcs.allIds];
    return [...new Set(ids)];
  }, [characters.allIds, npcs.allIds]);

  const resolvedCharacterId = useMemo(() => {
    if (characterParam && (characters.byId[characterParam] || npcs.byId[characterParam])) {
      return characterParam;
    }
    if (characterParam) return null;
    if (selectedId && (characters.byId[selectedId] || npcs.byId[selectedId])) return selectedId;
    const mine = user?.id
      ? allPlayableIds.find((id) => characters.byId[id]?.userId === user.id)
      : undefined;
    return mine ?? allPlayableIds[0] ?? null;
  }, [
    characterParam,
    characters.byId,
    npcs.byId,
    selectedId,
    allPlayableIds,
    user,
  ]);

  const selectedCharacter =
    resolvedCharacterId && (characters.byId[resolvedCharacterId] || npcs.byId[resolvedCharacterId])
      ? characters.byId[resolvedCharacterId] ?? npcs.byId[resolvedCharacterId]
      : null;

  const isGm = user?.id != null && session.createdBy != null && user.id === session.createdBy;
  const canEditSheet =
    !!selectedCharacter &&
    !!user &&
    (selectedCharacter.userId === user.id || (selectedCharacter.type === 'npc' && isGm));

  const cloudSync = Boolean(sessionId && user?.id && resolvedCharacterId && canEditSheet);

  useCharacterCloudSync(supabase, resolvedCharacterId, cloudSync);

  const signIn = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    if (error) setAuthError(error.message);
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col items-center justify-center p-8 font-mono text-sm">
        <p className="text-amber-400 mb-4">Invalid session URL.</p>
        <Link href="/" className="text-cyan-400 underline">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Link href="/" className="text-zinc-500 hover:text-cyan-400 text-sm shrink-0">
            ← Home
          </Link>
          <span className="text-zinc-600">|</span>
          <h1 className="text-cyan-400 font-bold uppercase tracking-wide truncate text-sm md:text-base">
            {session.name || 'Session'}
          </h1>
          {isGm && (
            <span className="text-[10px] uppercase bg-violet-900/50 text-violet-200 px-2 py-0.5 rounded border border-violet-700/40">
              GM
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/dev" className="hover:text-violet-400 underline">
            Dev hub
          </Link>
          <span className="text-zinc-700">·</span>
          <Link
            href={`/realtime-test?session=${encodeURIComponent(sessionId)}`}
            className="hover:text-violet-400 underline"
          >
            Realtime lab
          </Link>
        </div>
      </header>

      <div className="mx-4 my-4 md:mx-6 md:my-6 lg:mx-8 lg:my-8 flex flex-col lg:flex-row lg:items-start gap-6">
        <aside className="lg:w-64 shrink-0 space-y-4">
          {!user ? (
            <div className="rounded border border-zinc-700 bg-zinc-900/60 p-4 space-y-3">
              <p className="text-xs text-zinc-400">Sign in to load this session.</p>
              <input
                type="email"
                placeholder="Email"
                className="w-full bg-zinc-950 border border-zinc-600 rounded px-2 py-1.5 text-sm"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full bg-zinc-950 border border-zinc-600 rounded px-2 py-1.5 text-sm"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
              {authError && <p className="text-red-400 text-xs">{authError}</p>}
              <button
                type="button"
                onClick={() => void signIn()}
                className="w-full bg-cyan-800 hover:bg-cyan-700 text-white text-sm py-2 rounded"
              >
                Sign in
              </button>
            </div>
          ) : (
            <p className="text-xs text-emerald-500/90 truncate" title={user.email ?? user.id}>
              {user.email ?? user.id}
            </p>
          )}

          {user && !cloudHydrated && (
            <p className="text-xs text-zinc-500">Loading session…</p>
          )}

          {loadError && (
            <p className="text-xs text-red-400 border border-red-900/50 rounded p-2 bg-red-950/30">
              {loadError}
            </p>
          )}

          {user && cloudHydrated && !loadError && (
            <>
              <div>
                <h2 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">Characters</h2>
                <ul className="space-y-1">
                  {characters.allIds.map((id) => {
                    const c = characters.byId[id];
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => selectCharacter(id)}
                          className={`w-full text-left text-sm px-2 py-1.5 rounded border transition-colors ${
                            resolvedCharacterId === id
                              ? 'border-cyan-600 bg-cyan-950/50 text-cyan-200'
                              : 'border-transparent hover:border-zinc-600 text-zinc-300 hover:bg-zinc-900'
                          }`}
                        >
                          {c.name}
                          <span className="text-zinc-600 text-[10px] ml-1">PC</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {npcs.allIds.length > 0 && (
                <div>
                  <h2 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">NPCs</h2>
                  <ul className="space-y-1">
                    {npcs.allIds.map((id) => {
                      const c = npcs.byId[id];
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => selectCharacter(id)}
                            className={`w-full text-left text-sm px-2 py-1.5 rounded border transition-colors ${
                              resolvedCharacterId === id
                                ? 'border-amber-700 bg-amber-950/40 text-amber-100'
                                : 'border-transparent hover:border-zinc-600 text-zinc-300 hover:bg-zinc-900'
                            }`}
                          >
                            {c.name}
                            <span className="text-zinc-600 text-[10px] ml-1">NPC</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {allPlayableIds.length === 0 && (
                <p className="text-xs text-zinc-500">
                  No characters yet. Use{' '}
                  <Link href={`/realtime-test?session=${encodeURIComponent(sessionId)}`} className="text-violet-400 underline">
                    Realtime tools
                  </Link>{' '}
                  to create a character for this session.
                </p>
              )}
            </>
          )}
        </aside>

        <main className="flex-1 min-w-0">
          {user && cloudHydrated && !loadError && (
            <div className="max-w-[900px] mx-auto w-full mb-6">
              <MapCanvas sessionId={sessionId} supabase={supabase} userId={user.id} isGm={isGm} />
            </div>
          )}
          {user && cloudHydrated && !loadError && resolvedCharacterId && selectedCharacter && (
            <div className="max-w-[900px] mx-auto w-full space-y-2">
              {!canEditSheet && (
                <p className="text-xs text-amber-400/90 border border-amber-900/40 rounded px-2 py-1 bg-amber-950/20">
                  View only — you can only edit your own character (or NPCs if you are the session GM).
                </p>
              )}
              {!sheetPopout && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSheetPopout(true)}
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-cyan-700/50 text-cyan-300 hover:bg-cyan-950/40"
                  >
                    Pop out sheet
                  </button>
                </div>
              )}
              {sheetPopout ? (
                <p className="text-sm text-zinc-500">
                  Character sheet is in a floating window.{' '}
                  <button
                    type="button"
                    onClick={() => setSheetPopout(false)}
                    className="text-cyan-400 underline"
                  >
                    Dock here
                  </button>
                </p>
              ) : (
                <CharacterSheet characterId={resolvedCharacterId} editable={canEditSheet} />
              )}
            </div>
          )}
          {user && cloudHydrated && !loadError && allPlayableIds.length > 0 && !resolvedCharacterId && (
            <p className="text-zinc-500 text-sm">Select a character from the list.</p>
          )}
        </main>

        {user && cloudHydrated && !loadError && (
          <aside className="w-full min-w-0 lg:w-auto shrink-0">
            <ResizableChatPanel wideLayout={wideChatLayout}>
              <ChatInterface
                sessionId={sessionId}
                speakerName={selectedCharacter?.name ?? user.email ?? 'Player'}
                focusCharacterId={resolvedCharacterId}
                enabled
              />
            </ResizableChatPanel>
          </aside>
        )}
      </div>

      {user && cloudHydrated && !loadError && <DiceRoller />}

      {user &&
        cloudHydrated &&
        !loadError &&
        sheetPopout &&
        resolvedCharacterId &&
        selectedCharacter && (
          <PopoutCharacterSheet
            title={selectedCharacter.name}
            onDock={() => setSheetPopout(false)}
          >
            <CharacterSheet characterId={resolvedCharacterId} editable={canEditSheet} />
          </PopoutCharacterSheet>
        )}
    </div>
  );
}
