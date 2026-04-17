'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { characterRowEditableByUser } from '@/lib/auth/character-edit-policy';
import { useGameStore } from '@/lib/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { SessionCombatPostBody } from '@/lib/api/schemas/session-routes';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { applyGmPostSuccessToStore } from '@/lib/gm/apply-gm-client-response';

interface InitiativeTrackerProps {
  sessionId: string;
  supabase: SupabaseClient;
  isGm: boolean;
  /** When set, shows start-of-turn save prompts for your PC. */
  viewerUserId?: string | null;
  /** Speaker name for POST /api/gm (e.g. chat / referee). */
  gmRequestSpeakerName?: string;
}

export function InitiativeTracker({
  sessionId,
  supabase,
  isGm,
  viewerUserId = null,
  gmRequestSpeakerName = 'Referee',
}: InitiativeTrackerProps) {
  const { combatState, createdBy, diceOpen } = useGameStore(
    useShallow((s) => ({
      combatState: s.session.combatState,
      createdBy: s.session.createdBy,
      diceOpen: s.ui.isDiceRollerOpen,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [narrateBusy, setNarrateBusy] = useState(false);
  const [narrateErr, setNarrateErr] = useState<string | null>(null);
  const gmNarrationPending = useGameStore((s) => s.ui.gmNarrationPending);

  const postCombat = useCallback(
    async (body: SessionCombatPostBody) => {
      setErr(null);
      setBusy(true);
      try {
        const { data: authData } = await supabase.auth.getSession();
        const token = authData.session?.access_token;
        if (!token) {
          setErr('Not signed in');
          return;
        }
        const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/combat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? res.statusText);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, supabase],
  );

  const pending = combatState?.startOfTurnSavesPendingFor ?? null;
  const pendingChar = useGameStore((s) =>
    pending ? s.characters.byId[pending] ?? s.npcs.byId[pending] ?? null : null,
  );

  const didAutoSotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pending || !viewerUserId || !pendingChar) {
      didAutoSotRef.current = null;
      return;
    }
    if (pendingChar.type !== 'character') return;
    if (
      !characterRowEditableByUser({
        viewerUserId,
        characterUserId: pendingChar.userId,
        characterType: pendingChar.type,
        sessionCreatorId: createdBy,
      })
    ) {
      return;
    }
    const needs =
      pendingChar.isStunned ||
      ((pendingChar.derivedStats?.deathSaveTarget ?? -1) >= 0 && !pendingChar.isStabilized);
    if (!needs) return;

    const key = `${pending}|${combatState?.round ?? 0}|${combatState?.activeTurnIndex ?? 0}`;
    if (didAutoSotRef.current === key || diceOpen) return;
    didAutoSotRef.current = key;
    const raf = requestAnimationFrame(() => {
      useGameStore.getState().openStartOfTurnSavesIfNeeded(pending);
    });
    return () => cancelAnimationFrame(raf);
  }, [
    pending,
    viewerUserId,
    pendingChar,
    createdBy,
    combatState?.round,
    combatState?.activeTurnIndex,
    diceOpen,
  ]);

  const activeCombatant = useGameStore((s) => {
    const cs = s.session.combatState;
    if (!cs?.entries.length) return null;
    const e = cs.entries[cs.activeTurnIndex];
    if (!e) return null;
    return s.characters.byId[e.characterId] ?? s.npcs.byId[e.characterId] ?? null;
  });
  const showNarrateNpcTurn = isGm && activeCombatant?.type === 'npc';

  const requestNpcTurnNarration = useCallback(async () => {
    if (!isGm) return;
    const { session, characters, npcs } = useGameStore.getState();
    const cs = session.combatState;
    if (!cs?.entries.length) return;
    const e = cs.entries[cs.activeTurnIndex];
    if (!e) return;
    const ac = characters.byId[e.characterId] ?? npcs.byId[e.characterId];
    if (!ac || ac.type !== 'npc') return;

    setNarrateErr(null);
    setNarrateBusy(true);
    try {
      const accessToken = await getAccessTokenForApi(supabase);
      if (!accessToken) {
        setNarrateErr('Not signed in');
        return;
      }
      const wound = ac.derivedStats?.woundState ?? 'unknown';
      const stun = ac.isStunned ? 'stunned' : 'not stunned';
      const playerMessage = `[NPC turn — referee tool] Round ${cs.round}. Active combatant: **${ac.name}** (NPC, sheet id \`${ac.id}\`). Snapshot: wound **${wound}**, ${stun}, damage **${ac.damage}**/41, stabilized **${ac.isStabilized}**.

Please narrate the **start of this NPC's turn** in combat (brief, tense, actionable). Do **not** advance the initiative tracker, resolve PC start-of-turn saves, or roll dice unless the table asks — those are human/tool controlled.`;

      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId,
          playerMessage,
          speakerName: gmRequestSpeakerName,
          playerMessageMetadata: {
            kind: 'npc_turn_narration_request',
            npcCharacterId: ac.id,
            combatRound: cs.round,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNarrateErr((data as { error?: string }).error ?? res.statusText ?? 'Request failed');
        return;
      }
      applyGmPostSuccessToStore(data);
    } catch (e) {
      setNarrateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNarrateBusy(false);
    }
  }, [gmRequestSpeakerName, isGm, sessionId, supabase]);

  const showSotPrompt =
    !!pending &&
    !!viewerUserId &&
    pendingChar?.type === 'character' &&
    characterRowEditableByUser({
      viewerUserId,
      characterUserId: pendingChar.userId,
      characterType: pendingChar.type,
      sessionCreatorId: createdBy,
    }) &&
    (pendingChar.isStunned ||
      ((pendingChar.derivedStats?.deathSaveTarget ?? -1) >= 0 && !pendingChar.isStabilized));

  if (!combatState || combatState.entries.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
        <h2 className="text-[10px] uppercase text-zinc-500 tracking-wider">Initiative</h2>
        <p className="text-xs text-zinc-500">No active combat.</p>
        {isGm && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void postCombat({ action: 'start_combat' })}
            className="w-full text-[11px] uppercase tracking-wide py-1.5 rounded border border-rose-800/60 text-rose-200 hover:bg-rose-950/35 disabled:opacity-50"
          >
            {busy ? '…' : 'Start combat (roll all)'}
          </button>
        )}
        {err && <p className="text-[11px] text-red-400">{err}</p>}
      </div>
    );
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase text-zinc-500 tracking-wider">Initiative</h2>
        <span className="text-[11px] font-mono text-cyan-400/90">R{combatState.round}</span>
      </div>
      <ol className="space-y-1 max-h-48 overflow-y-auto text-xs">
        {combatState.entries.map((e, i) => {
          const isActive = i === combatState.activeTurnIndex;
          return (
            <li
              key={e.characterId}
              className={`flex justify-between gap-2 rounded px-1.5 py-1 border ${
                isActive
                  ? 'border-cyan-600/70 bg-cyan-950/40 text-cyan-100'
                  : 'border-transparent text-zinc-300'
              }`}
            >
              <span className="truncate font-medium">{e.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-zinc-400">{e.total}</span>
            </li>
          );
        })}
      </ol>
      {showSotPrompt && pending && (
        <div className="rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5 space-y-1">
          <p className="text-[10px] text-amber-100/90 leading-snug">
            <span className="font-bold uppercase">Your turn — saves</span>
            <br />
            Stun recovery and/or ongoing death save (combat tracker).
          </p>
          <button
            type="button"
            onClick={() => useGameStore.getState().openStartOfTurnSavesIfNeeded(pending)}
            className="w-full text-[10px] uppercase py-1 rounded border border-amber-600/70 text-amber-100 hover:bg-amber-900/40"
          >
            {diceOpen ? 'Dice open — finish rolls' : 'Roll start-of-turn saves'}
          </button>
        </div>
      )}
      {showNarrateNpcTurn && activeCombatant && (
        <div className="rounded border border-violet-800/45 bg-violet-950/25 px-2 py-1.5 space-y-1">
          <p className="text-[10px] text-violet-100/90 leading-snug">
            <span className="font-bold uppercase">AI-GM · NPC turn</span>
            <br />
            Active: {activeCombatant.name}
          </p>
          <button
            type="button"
            disabled={narrateBusy || gmNarrationPending}
            onClick={() => void requestNpcTurnNarration()}
            className="w-full text-[10px] uppercase py-1 rounded border border-violet-600/70 text-violet-100 hover:bg-violet-900/35 disabled:opacity-50"
          >
            {narrateBusy || gmNarrationPending ? '…' : 'Narrate turn (AI-GM)'}
          </button>
          {narrateErr && <p className="text-[10px] text-red-400">{narrateErr}</p>}
        </div>
      )}
      {isGm && (
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void postCombat({ action: 'next_turn' })}
              className="flex-1 min-w-24 text-[10px] uppercase py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Next turn
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void postCombat({ action: 'advance_round' })}
              className="flex-1 min-w-24 text-[10px] uppercase py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Advance round
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void postCombat({ action: 'end_combat' })}
              className="w-full text-[10px] uppercase py-1 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800/80 disabled:opacity-50"
            >
              End combat
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void postCombat({ action: 'end_combat', clear_timed_conditions: true })}
              className="w-full text-[10px] uppercase py-1 rounded border border-amber-900/50 text-amber-200/90 hover:bg-amber-950/35 disabled:opacity-50"
            >
              End combat + clear timed conditions
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-[11px] text-red-400">{err}</p>}
    </div>
  );
}
