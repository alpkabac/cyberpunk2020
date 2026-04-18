'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { CharacterSheet, ChargenWizard, DiceRoller } from '@/components/character';
import { ChatInterface, ResizableChatPanel } from '@/components/chat';
import { PopoutCharacterSheet } from '@/components/session/PopoutCharacterSheet';
import { PopoutSceneImage } from '@/components/session/PopoutSceneImage';
import { InitiativeTracker } from '@/components/session/InitiativeTracker';
import { SessionSoundtrackPlayer } from '@/components/session/SessionSoundtrackPlayer';
import { StartOfTurnDeathSaveAck } from '@/components/session/StartOfTurnDeathSaveAck';
import { MapCanvas, TokenContextCard } from '@/components/map';
import { supabase } from '@/lib/supabase';
import { useGameStore } from '@/lib/store/game-store';
import { useSessionRealtimeSync } from '@/lib/hooks/useSessionRealtimeSync';
import { useCharacterCloudSync } from '@/lib/hooks/useCharacterCloudSync';
import { useShallow } from 'zustand/react/shallow';
import type { Character } from '@/lib/types';
import type { SessionPresencePeer } from '@/lib/realtime';
import {
  MAP_GRID_DEFAULT_COLS,
  MAP_GRID_DEFAULT_ROWS,
  normalizeGridDimension,
  snapPctToGrid,
} from '@/lib/map/grid';
import { playSessionUi } from '@/lib/audio/session-sfx';

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

  // Sheet drawer: collapsed by default
  const [sheetOpen, setSheetOpen] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [presencePeers, setPresencePeers] = useState<SessionPresencePeer[]>([]);
  const [chargenFor, setChargenFor] = useState<{ userId: string; suggestedName: string } | null>(null);
  const [tokenPlaceBusyId, setTokenPlaceBusyId] = useState<string | null>(null);
  const [npcRemoveBusy, setNpcRemoveBusy] = useState(false);

  // Token context card (left-click)
  const [contextTokenId, setContextTokenId] = useState<string | null>(null);

  // Token sheet popout (right-click)
  const [tokenSheetPopoutId, setTokenSheetPopoutId] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setWideChatLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const session = useGameStore((s) => s.session);
  const narrationImage = session.narrationImage;
  const sceneHandoutKey = narrationImage
    ? `${narrationImage.url}\0${String(narrationImage.revision ?? '')}`
    : '';
  const [sceneHandoutDismissed, setSceneHandoutDismissed] = useState(false);
  const characters = useGameStore(
    useShallow((s) => ({ byId: s.characters.byId, allIds: s.characters.allIds })),
  );
  const npcs = useGameStore(
    useShallow((s) => ({ byId: s.npcs.byId, allIds: s.npcs.allIds })),
  );
  const tokens = useGameStore((s) => s.map.tokens);

  useEffect(() => {
    setSceneHandoutDismissed(false);
  }, [sceneHandoutKey]);

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

  useEffect(() => {
    useGameStore.getState().setSessionViewerUserId(user?.id ?? null);
    return () => {
      useGameStore.getState().setSessionViewerUserId(null);
    };
  }, [user?.id, sessionId]);

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

  const sessionPresence = useMemo(
    () =>
      user
        ? {
            track: { userId: user.id, email: user.email ?? null },
            onPeers: setPresencePeers,
          }
        : undefined,
    [user],
  );

  useSessionRealtimeSync(supabase, sessionId || null, user?.id, onSyncComplete, sessionPresence);

  const selectCharacter = useCallback(
    (id: string) => {
      playSessionUi('select');
      setSelectedId(id);
      setSheetPopout(false);
      router.replace(`/session/${sessionId}?character=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router, sessionId],
  );

  const toggleDockedSheet = useCallback(() => {
    playSessionUi('panel');
    setSheetOpen((v) => !v);
  }, []);

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

  /** Session creator: map/NPC/host tools — not the same as the AI Game Master. */
  const isSessionHost =
    user?.id != null && session.createdBy != null && user.id === session.createdBy;

  const canEditForChar = useCallback(
    (c: Character): boolean => {
      if (!user) return false;
      if (c.userId === user.id) return true;
      if (c.type === 'npc' && isSessionHost) return true;
      if (c.type === 'character' && isSessionHost && (!c.userId || c.userId === '')) return true;
      return false;
    },
    [user, isSessionHost],
  );

  const canEditSheet = !!selectedCharacter && canEditForChar(selectedCharacter);

  const cloudSync = Boolean(sessionId && user?.id && resolvedCharacterId && canEditSheet);
  useCharacterCloudSync(supabase, resolvedCharacterId, cloudSync);

  // My own character (for "Place my token")
  const myCharacter = useMemo(
    () =>
      user
        ? characters.allIds.map((id) => characters.byId[id]).find((c) => c.userId === user.id) ?? null
        : null,
    [user, characters.allIds, characters.byId],
  );

  const sortedPresencePeers = useMemo(() => {
    const hostId = session.createdBy;
    return [...presencePeers].sort((a, b) => {
      const aHost = hostId && a.userId === hostId ? 0 : 1;
      const bHost = hostId && b.userId === hostId ? 0 : 1;
      if (aHost !== bHost) return aHost - bHost;
      return (a.email ?? a.userId).localeCompare(b.email ?? b.userId);
    });
  }, [presencePeers, session.createdBy]);

  const presenceIdSet = useMemo(() => new Set(presencePeers.map((p) => p.userId)), [presencePeers]);

  const unclaimedPcs = useMemo(
    () =>
      characters.allIds
        .map((id) => characters.byId[id])
        .filter((c) => c.type === 'character' && (!c.userId || c.userId === '')),
    [characters.allIds, characters.byId],
  );

  const awayOwners = useMemo(() => {
    const m = new Map<string, Character[]>();
    for (const id of characters.allIds) {
      const c = characters.byId[id];
      if (c.type !== 'character' || !c.userId || c.userId === '') continue;
      if (presenceIdSet.has(c.userId)) continue;
      const arr = m.get(c.userId) ?? [];
      arr.push(c);
      m.set(c.userId, arr);
    }
    return m;
  }, [characters.allIds, characters.byId, presenceIdSet]);

  const canAddCharacterForUser = useCallback(
    (targetUserId: string): boolean => {
      if (!user) return false;
      return isSessionHost || targetUserId === user.id;
    },
    [user, isSessionHost],
  );

  const canPlaceTokenForCharacter = useCallback(
    (c: Character): boolean => {
      if (!user) return false;
      if (isSessionHost) return true;
      return c.userId === user.id;
    },
    [user, isSessionHost],
  );

  // Token context card data
  const contextToken = contextTokenId ? tokens.find((t) => t.id === contextTokenId) ?? null : null;
  const contextCharacter = contextToken?.characterId
    ? (characters.byId[contextToken.characterId] ?? npcs.byId[contextToken.characterId] ?? null)
    : null;
  const canEditContextChar = contextCharacter ? canEditForChar(contextCharacter) : false;

  // Token sheet popout data (right-click)
  const tokenSheetCharacter = tokenSheetPopoutId
    ? (characters.byId[tokenSheetPopoutId] ?? npcs.byId[tokenSheetPopoutId] ?? null)
    : null;

  // Token handlers for MapCanvas
  const handleTokenClick = useCallback((id: string) => {
    setContextTokenId((prev) => (prev === id ? null : id));
    setTokenSheetPopoutId(null);
  }, []);

  const handleTokenRightClick = useCallback((id: string) => {
    // Right-click opens the character linked to the token (not the token id itself)
    const tok = useGameStore.getState().map.tokens.find((t) => t.id === id);
    const charId = tok?.characterId ?? null;
    setTokenSheetPopoutId(charId);
    setContextTokenId(null);
  }, []);

  // "Place my token" callback (first owned PC — additional PCs use sidebar)
  const handlePlaceMyToken = useCallback(async () => {
    if (!myCharacter || !sessionId) return;
    const hasToken = useGameStore.getState().map.tokens.some((t) => t.characterId === myCharacter.id);
    if (hasToken) return;
    const st = useGameStore.getState().session.settings;
    let x = 50;
    let y = 50;
    if (st.mapSnapToGrid) {
      const cols = normalizeGridDimension(st.mapGridCols, MAP_GRID_DEFAULT_COLS);
      const rows = normalizeGridDimension(st.mapGridRows, MAP_GRID_DEFAULT_ROWS);
      const s = snapPctToGrid(50, 50, cols, rows);
      x = s.x;
      y = s.y;
    }
    await supabase.from('tokens').insert({
      session_id: sessionId,
      character_id: myCharacter.id,
      name: myCharacter.name,
      image_url: myCharacter.imageUrl ?? '',
      x,
      y,
      size: 50,
      controlled_by: 'player',
    });
  }, [myCharacter, sessionId]);

  const handlePlaceTokenForCharacter = useCallback(
    async (c: Character) => {
      if (!sessionId || !user) return;
      if (!canPlaceTokenForCharacter(c)) return;
      const hasToken = useGameStore.getState().map.tokens.some((t) => t.characterId === c.id);
      if (hasToken) {
        setClaimError('This character already has a token on the map.');
        return;
      }
      setClaimError(null);
      setTokenPlaceBusyId(c.id);
      try {
        const st = useGameStore.getState().session.settings;
        let x = 50;
        let y = 50;
        if (st.mapSnapToGrid) {
          const cols = normalizeGridDimension(st.mapGridCols, MAP_GRID_DEFAULT_COLS);
          const rows = normalizeGridDimension(st.mapGridRows, MAP_GRID_DEFAULT_ROWS);
          const s = snapPctToGrid(50, 50, cols, rows);
          x = s.x;
          y = s.y;
        }
        const { error } = await supabase.from('tokens').insert({
          session_id: sessionId,
          character_id: c.id,
          name: c.name,
          image_url: c.imageUrl ?? '',
          x,
          y,
          size: 50,
          controlled_by: 'player',
        });
        if (error) setClaimError(error.message);
      } finally {
        setTokenPlaceBusyId(null);
      }
    },
    [sessionId, user, canPlaceTokenForCharacter],
  );

  const handleClaimCharacter = useCallback(
    async (characterId: string) => {
      if (!user) return;
      setClaimError(null);
      const { error } = await supabase.rpc('claim_session_character', { p_character_id: characterId });
      if (error) setClaimError(error.message);
    },
    [user],
  );

  const patchNpcDamage = useCallback(
    async (delta: number) => {
      const sel = selectedCharacter;
      if (!isSessionHost || !sel || sel.type !== 'npc' || !sessionId) return;
      const next = Math.max(0, Math.min(41, sel.damage + delta));
      if (next === sel.damage) return;
      setClaimError(null);
      const store = useGameStore.getState();
      store.beginOptimisticCharacterEdit(sel.id);
      store.updateNPC(sel.id, { damage: next });
      const { error } = await supabase
        .from('characters')
        .update({ damage: next })
        .eq('id', sel.id)
        .eq('session_id', sessionId);
      if (error) {
        store.rollbackOptimisticCharacterEdit(sel.id);
        setClaimError(error.message);
      } else {
        store.clearOptimisticCharacterBackup(sel.id);
      }
    },
    [isSessionHost, selectedCharacter, sessionId],
  );

  const handleRemoveNpc = useCallback(
    async (npcId: string) => {
      if (!user || !sessionId) return;
      if (!window.confirm('Remove this NPC from the session? Linked map tokens are removed too.')) return;
      setClaimError(null);
      setNpcRemoveBusy(true);
      try {
        const { error } = await supabase.from('characters').delete().eq('id', npcId).eq('session_id', sessionId);
        if (error) setClaimError(error.message);
        else if (resolvedCharacterId === npcId) {
          router.replace(`/session/${sessionId}`, { scroll: false });
          setSelectedId(null);
        }
      } finally {
        setNpcRemoveBusy(false);
      }
    },
    [user, sessionId, resolvedCharacterId, router],
  );

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
          {isSessionHost && (
            <span
              className="text-[10px] uppercase bg-violet-900/50 text-violet-200 px-2 py-0.5 rounded border border-violet-700/40"
              title="You created this room — extra session controls (map, NPCs). The AI is still the Game Master in play."
            >
              Host
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
        {/* Left sidebar */}
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
              <Link
                href={`/login?next=${encodeURIComponent(`/session/${sessionId}`)}`}
                className="block text-center text-cyan-500 hover:text-cyan-400 text-xs underline"
              >
                Open full sign-up page
              </Link>
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
              {claimError && (
                <p className="text-xs text-red-400 border border-red-900/40 rounded p-2 bg-red-950/25">{claimError}</p>
              )}
              <div className="space-y-3">
                <div>
                  <h2 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">Online</h2>
                  {sortedPresencePeers.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">Connecting…</p>
                  ) : (
                    <div className="space-y-2">
                      {sortedPresencePeers.map((peer) => {
                        const peerChars = characters.allIds
                          .map((id) => characters.byId[id])
                          .filter((c) => c.type === 'character' && c.userId === peer.userId);
                        const isSelf = user?.id === peer.userId;
                        const isPeerSessionHost = session.createdBy === peer.userId;
                        const showAdd = canAddCharacterForUser(peer.userId);
                        return (
                          <div
                            key={peer.userId}
                            className="rounded border border-zinc-800 bg-zinc-900/40 p-2 space-y-2"
                          >
                            <div className="flex items-center gap-2 text-xs min-w-0">
                              <span
                                className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"
                                title="Connected"
                              />
                              <span
                                className="truncate font-medium text-zinc-200"
                                title={peer.email ?? peer.userId}
                              >
                                {peer.email ?? peer.userId}
                              </span>
                              {isSelf && <span className="text-[10px] text-cyan-500 shrink-0">You</span>}
                              {isPeerSessionHost && (
                                <span
                                  className="text-[9px] uppercase bg-violet-900/50 text-violet-200 px-1 rounded border border-violet-700/40 shrink-0"
                                  title="Session creator — room tools, not the AI GM"
                                >
                                  Host
                                </span>
                              )}
                            </div>
                            {peerChars.length === 0 ? (
                              <p className="text-[11px] text-zinc-500 pl-1">No characters yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {peerChars.map((c) => {
                                  const hasToken = tokens.some((t) => t.characterId === c.id);
                                  const canPlace = canPlaceTokenForCharacter(c) && !hasToken;
                                  return (
                                    <li key={c.id} className="flex gap-1 items-stretch">
                                      <button
                                        type="button"
                                        onClick={() => selectCharacter(c.id)}
                                        className={`flex-1 min-w-0 text-left text-sm px-2 py-1.5 rounded border transition-colors ${
                                          resolvedCharacterId === c.id
                                            ? 'border-cyan-600 bg-cyan-950/50 text-cyan-200'
                                            : 'border-transparent hover:border-zinc-600 text-zinc-300 hover:bg-zinc-900'
                                        }`}
                                      >
                                        {c.name}
                                        <span className="text-zinc-600 text-[10px] ml-1">PC</span>
                                      </button>
                                      {canPlace ? (
                                        <button
                                          type="button"
                                          title="Place token on map"
                                          disabled={tokenPlaceBusyId === c.id}
                                          className="shrink-0 px-2 text-[10px] uppercase font-bold text-emerald-300 border border-emerald-800/60 rounded hover:bg-emerald-950/35 disabled:opacity-50"
                                          onClick={() => void handlePlaceTokenForCharacter(c)}
                                        >
                                          {tokenPlaceBusyId === c.id ? '…' : 'Map'}
                                        </button>
                                      ) : hasToken ? (
                                        <span
                                          className="shrink-0 self-center text-[9px] text-zinc-600 px-1"
                                          title="Already on map"
                                        >
                                          On map
                                        </span>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {showAdd && (
                              <button
                                type="button"
                                onClick={() => {
                                  const ownedCount = characters.allIds.filter(
                                    (id) => characters.byId[id].userId === peer.userId,
                                  ).length;
                                  const label =
                                    peer.email?.split('@')[0]?.trim() ||
                                    (peer.userId === user.id ? 'You' : `User ${peer.userId.slice(0, 8)}`);
                                  setChargenFor({
                                    userId: peer.userId,
                                    suggestedName: `${label} · ${ownedCount + 1}`,
                                  });
                                }}
                                className="w-full text-[11px] uppercase tracking-wide py-1.5 rounded border border-violet-700/50 text-violet-200 hover:bg-violet-950/40 disabled:opacity-50"
                              >
                                New character…
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {unclaimedPcs.length > 0 && (
                  <div>
                    <h2 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">
                      Open characters
                    </h2>
                    <ul className="space-y-1">
                      {unclaimedPcs.map((c) => {
                        const canClaim = !!user && !isSessionHost && !myCharacter;
                        const hasToken = tokens.some((t) => t.characterId === c.id);
                        const canPlace = canPlaceTokenForCharacter(c) && !hasToken;
                        return (
                          <li key={c.id} className="space-y-1">
                            <div className="flex gap-1 items-stretch">
                              <button
                                type="button"
                                onClick={() => selectCharacter(c.id)}
                                className={`flex-1 min-w-0 text-left text-sm px-2 py-1.5 rounded border transition-colors ${
                                  resolvedCharacterId === c.id
                                    ? 'border-cyan-600 bg-cyan-950/50 text-cyan-200'
                                    : 'border-transparent hover:border-zinc-600 text-zinc-300 hover:bg-zinc-900'
                                }`}
                              >
                                {c.name}
                                <span className="text-zinc-600 text-[10px] ml-1">PC</span>
                                <span className="text-amber-600/90 text-[10px] ml-1">· open</span>
                              </button>
                              {canPlace ? (
                                <button
                                  type="button"
                                  title="Place token on map"
                                  disabled={tokenPlaceBusyId === c.id}
                                  className="shrink-0 px-2 text-[10px] uppercase font-bold text-emerald-300 border border-emerald-800/60 rounded hover:bg-emerald-950/35 disabled:opacity-50"
                                  onClick={() => void handlePlaceTokenForCharacter(c)}
                                >
                                  {tokenPlaceBusyId === c.id ? '…' : 'Map'}
                                </button>
                              ) : hasToken ? (
                                <span
                                  className="shrink-0 self-center text-[9px] text-zinc-600 px-1"
                                  title="Already on map"
                                >
                                  On map
                                </span>
                              ) : null}
                            </div>
                            {canClaim && (
                              <button
                                type="button"
                                onClick={() => void handleClaimCharacter(c.id)}
                                className="w-full text-[11px] uppercase tracking-wide py-1 rounded border border-amber-800/60 text-amber-200 hover:bg-amber-950/40"
                              >
                                Claim this character
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {awayOwners.size > 0 && (
                  <div>
                    <h2 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">
                      Not connected
                    </h2>
                    <div className="space-y-2">
                      {[...awayOwners.entries()].map(([ownerId, list]) => (
                        <div
                          key={ownerId}
                          className="rounded border border-zinc-800/80 bg-zinc-950/40 p-2 space-y-1"
                        >
                          <p className="text-[10px] text-zinc-500 truncate" title={ownerId}>
                            Owner · {ownerId.slice(0, 8)}…
                          </p>
                          <ul className="space-y-1">
                            {list.map((c) => {
                              const hasToken = tokens.some((t) => t.characterId === c.id);
                              const canPlace = canPlaceTokenForCharacter(c) && !hasToken;
                              return (
                                <li key={c.id} className="flex gap-1 items-stretch">
                                  <button
                                    type="button"
                                    onClick={() => selectCharacter(c.id)}
                                    className={`flex-1 min-w-0 text-left text-sm px-2 py-1.5 rounded border transition-colors ${
                                      resolvedCharacterId === c.id
                                        ? 'border-cyan-600 bg-cyan-950/50 text-cyan-200'
                                        : 'border-transparent hover:border-zinc-600 text-zinc-300 hover:bg-zinc-900'
                                    }`}
                                  >
                                    {c.name}
                                    <span className="text-zinc-600 text-[10px] ml-1">PC</span>
                                  </button>
                                  {canPlace ? (
                                    <button
                                      type="button"
                                      title="Place token on map"
                                      disabled={tokenPlaceBusyId === c.id}
                                      className="shrink-0 px-2 text-[10px] uppercase font-bold text-emerald-300 border border-emerald-800/60 rounded hover:bg-emerald-950/35 disabled:opacity-50"
                                      onClick={() => void handlePlaceTokenForCharacter(c)}
                                    >
                                      {tokenPlaceBusyId === c.id ? '…' : 'Map'}
                                    </button>
                                  ) : hasToken ? (
                                    <span
                                      className="shrink-0 self-center text-[9px] text-zinc-600 px-1"
                                      title="Already on map"
                                    >
                                      On map
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {npcs.allIds.length > 0 && (
                <div>
                  <h2 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">NPCs</h2>
                  <ul className="space-y-1">
                    {npcs.allIds.map((id) => {
                      const c = npcs.byId[id];
                      return (
                        <li key={id} className="flex gap-1 items-stretch">
                          <button
                            type="button"
                            onClick={() => selectCharacter(id)}
                            className={`flex-1 min-w-0 text-left text-sm px-2 py-1.5 rounded border transition-colors ${
                              resolvedCharacterId === id
                                ? 'border-amber-700 bg-amber-950/40 text-amber-100'
                                : 'border-transparent hover:border-zinc-600 text-zinc-300 hover:bg-zinc-900'
                            }`}
                          >
                            {c.name}
                            <span className="text-zinc-600 text-[10px] ml-1">NPC</span>
                          </button>
                          {user && (
                            <button
                              type="button"
                              title="Remove NPC"
                              className="shrink-0 px-2 text-xs text-red-400 border border-red-900/50 rounded hover:bg-red-950/40 disabled:opacity-50"
                              disabled={npcRemoveBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRemoveNpc(id);
                              }}
                            >
                              ×
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {isSessionHost && selectedCharacter?.type === 'npc' && (
                    <div className="mt-3 rounded border border-amber-900/40 bg-amber-950/20 p-2 space-y-2">
                      <p className="text-[10px] uppercase text-amber-600/90 tracking-wide">
                        GM · {selectedCharacter.name}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        Wound track: {selectedCharacter.damage}/41
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="text-[10px] uppercase px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          onClick={() => void patchNpcDamage(-5)}
                        >
                          −5
                        </button>
                        <button
                          type="button"
                          className="text-[10px] uppercase px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          onClick={() => void patchNpcDamage(-1)}
                        >
                          −1
                        </button>
                        <button
                          type="button"
                          className="text-[10px] uppercase px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          onClick={() => void patchNpcDamage(1)}
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          className="text-[10px] uppercase px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          onClick={() => void patchNpcDamage(5)}
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  )}
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
              <InitiativeTracker
                sessionId={sessionId}
                supabase={supabase}
                isGm={isSessionHost}
                viewerUserId={user?.id ?? null}
                gmRequestSpeakerName={selectedCharacter?.name ?? user.email ?? 'Referee'}
              />
              <SessionSoundtrackPlayer sessionId={sessionId} supabase={supabase} />
            </>
          )}
        </aside>

        {/* Main column */}
        <main className="flex-1 min-w-0 space-y-4">
          {/* Map — TokenContextCard is rendered inside the board as boardOverlay */}
          {user && cloudHydrated && !loadError && (
            <MapCanvas
              sessionId={sessionId}
              supabase={supabase}
              userId={user.id}
              isGm={isSessionHost}
              onTokenClick={handleTokenClick}
              onTokenRightClick={handleTokenRightClick}
              myCharacterId={myCharacter?.id ?? null}
              onPlaceMyToken={() => void handlePlaceMyToken()}
              boardOverlay={
                contextToken ? (
                  <TokenContextCard
                    token={contextToken}
                    character={contextCharacter}
                    canEdit={canEditContextChar}
                    supabase={supabase}
                    sessionId={sessionId}
                    onViewSheet={() => {
                      const charId = contextToken.characterId;
                      if (charId) setTokenSheetPopoutId(charId);
                    }}
                    onClose={() => setContextTokenId(null)}
                  />
                ) : undefined
              }
            />
          )}

          {/* ── Sheet toggle bar ── */}
          {user && cloudHydrated && !loadError && resolvedCharacterId && selectedCharacter && (
            <div className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              {/* Outer row — never a <button> so action buttons inside are valid */}
              <div className="w-full flex items-center justify-between gap-2 px-3 py-2.5">
                {/* Left: name + labels — clicking here toggles the sheet */}
                <button
                  type="button"
                  onClick={toggleDockedSheet}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                >
                  <span className="text-sm font-semibold text-zinc-100 truncate">{selectedCharacter.name}</span>
                  <span className="text-[10px] text-zinc-500 hidden sm:block">
                    · Stats · Skills · Combat · Gear
                  </span>
                  {!canEditSheet && (
                    <span className="text-[9px] uppercase bg-amber-900/40 text-amber-300 border border-amber-700/40 px-1 py-0.5 rounded">
                      View only
                    </span>
                  )}
                </button>
                {/* Right: action buttons + chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  {sheetOpen && !sheetPopout && selectedCharacter?.type === 'npc' && user && (
                    <button
                      type="button"
                      disabled={npcRemoveBusy}
                      title="Delete this NPC from the session"
                      className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-red-800/60 text-red-300 hover:bg-red-950/45 disabled:opacity-50"
                      onClick={() => void handleRemoveNpc(selectedCharacter.id)}
                    >
                      {npcRemoveBusy ? '…' : 'Remove NPC'}
                    </button>
                  )}
                  {sheetOpen && !sheetPopout && (
                    <button
                      type="button"
                      className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-cyan-700/50 text-cyan-300 hover:bg-cyan-950/40"
                      onClick={() => {
                        playSessionUi('commit', 0.85);
                        setSheetPopout(true);
                        setSheetOpen(false);
                      }}
                    >
                      Pop out
                    </button>
                  )}
                  {/* Chevron — clicking also toggles */}
                  <button
                    type="button"
                    onClick={toggleDockedSheet}
                    className="hover:opacity-80 transition-opacity"
                    aria-label={sheetOpen ? 'Collapse sheet' : 'Expand sheet'}
                  >
                    {sheetPopout ? (
                      <span className="text-[10px] text-violet-400">Floating ↗</span>
                    ) : (
                      <svg
                        className={`w-4 h-4 text-zinc-400 transition-transform duration-150 ${sheetOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible sheet body */}
              {sheetOpen && !sheetPopout && (
                <div className="border-t border-zinc-800">
                  <CharacterSheet characterId={resolvedCharacterId} editable={canEditSheet} />
                </div>
              )}

              {sheetPopout && (
                <p className="text-xs text-zinc-500 px-3 py-2 border-t border-zinc-800">
                  Sheet is in a floating window.{' '}
                  <button
                    type="button"
                    onClick={() => setSheetPopout(false)}
                    className="text-cyan-400 underline"
                  >
                    Dock here
                  </button>
                </p>
              )}
            </div>
          )}

          {user && cloudHydrated && !loadError && allPlayableIds.length > 0 && !resolvedCharacterId && (
            <p className="text-zinc-500 text-sm">Select a character from the list.</p>
          )}
        </main>

        {/* Right aside: chat */}
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

      {/* Floating dice roller */}
      {user && cloudHydrated && !loadError && <DiceRoller />}
      {user && cloudHydrated && !loadError && <StartOfTurnDeathSaveAck />}

      {/* Own character sheet popout (from toggle bar) */}
      {user && cloudHydrated && !loadError && narrationImage && !sceneHandoutDismissed && (
        <PopoutSceneImage
          title={narrationImage.caption ?? 'Scene image'}
          imageUrl={narrationImage.url}
          imageKey={`${narrationImage.url}-${narrationImage.revision}`}
          onClose={() => setSceneHandoutDismissed(true)}
        />
      )}

      {user &&
        cloudHydrated &&
        !loadError &&
        sheetPopout &&
        resolvedCharacterId &&
        selectedCharacter && (
          <PopoutCharacterSheet
            title={selectedCharacter.name}
            onDock={() => setSheetPopout(false)}
            headerExtra={
              selectedCharacter.type === 'npc' && user ? (
                <button
                  type="button"
                  disabled={npcRemoveBusy}
                  title="Delete this NPC from the session"
                  className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-red-800/60 text-red-300 hover:bg-red-950/45 disabled:opacity-50 cursor-pointer"
                  onClick={() => void handleRemoveNpc(selectedCharacter.id)}
                >
                  {npcRemoveBusy ? '…' : 'Remove NPC'}
                </button>
              ) : undefined
            }
          >
            <CharacterSheet characterId={resolvedCharacterId} editable={canEditSheet} />
          </PopoutCharacterSheet>
        )}

      {/* Token right-click sheet popout */}
      {chargenFor && sessionId && user && (
        <ChargenWizard
          open
          onClose={() => setChargenFor(null)}
          sessionId={sessionId}
          userId={chargenFor.userId}
          defaultName={chargenFor.suggestedName}
          supabase={supabase}
          onCreated={(id) => {
            setChargenFor(null);
            selectCharacter(id);
          }}
        />
      )}

      {tokenSheetCharacter && (
        <PopoutCharacterSheet
          title={tokenSheetCharacter.name}
          onDock={() => setTokenSheetPopoutId(null)}
          headerExtra={
            tokenSheetCharacter.type === 'npc' && user ? (
              <button
                type="button"
                disabled={npcRemoveBusy}
                title="Delete this NPC from the session"
                className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-red-800/60 text-red-300 hover:bg-red-950/45 disabled:opacity-50 cursor-pointer"
                onClick={() => void handleRemoveNpc(tokenSheetCharacter.id)}
              >
                {npcRemoveBusy ? '…' : 'Remove NPC'}
              </button>
            ) : undefined
          }
        >
          <CharacterSheet
            characterId={tokenSheetCharacter.id}
            editable={canEditForChar(tokenSheetCharacter)}
          />
        </PopoutCharacterSheet>
      )}

    </div>
  );
}
