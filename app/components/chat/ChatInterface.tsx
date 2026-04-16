'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { sortChatMessagesByTimestamp } from '@/lib/chat/chat-order';
import type { ChatMessage } from '@/lib/types';
import {
  resolveGmRequestRoll,
  rollRequestMetadataToInput,
} from '@/lib/game-logic/resolve-gm-request-roll';

/** Avoid duplicate auto-opens across React Strict Mode remounts within a page session. */
const autoOpenedRollRequestIds = new Set<string>();

function typeLabel(type: ChatMessage['type'], meta?: Record<string, unknown>): string {
  if (type === 'system' && meta?.kind === 'roll_request') return 'ROLL';
  switch (type) {
    case 'narration':
      return 'GM';
    case 'player':
      return 'PLAYER';
    case 'system':
      return 'SYS';
    case 'roll':
      return 'DICE';
  }
}

function bubbleClasses(type: ChatMessage['type'], meta?: Record<string, unknown>): string {
  if (type === 'system' && meta?.kind === 'roll_request') {
    return 'border-l-amber-400 bg-amber-950/50 text-amber-50';
  }
  switch (type) {
    case 'narration':
      return 'border-l-violet-400 bg-violet-950/40 text-violet-50';
    case 'player':
      return 'border-l-cyan-500 bg-cyan-950/30 text-cyan-50';
    case 'system':
      return 'border-l-zinc-500 bg-zinc-900/70 text-zinc-200';
    case 'roll':
      return 'border-l-emerald-500 bg-emerald-950/35 text-emerald-50';
  }
}

export interface ChatInterfaceProps {
  sessionId: string;
  /** Shown as chat speaker for player messages and roll replies (e.g. character name). */
  speakerName: string;
  /** When false, input is disabled (e.g. not signed in). */
  enabled?: boolean;
  /** Selected character id — used when GM omits character_id on the request. */
  focusCharacterId?: string | null;
}

export function ChatInterface({
  sessionId,
  speakerName,
  enabled = true,
  focusCharacterId = null,
}: ChatInterfaceProps) {
  const rawMessages = useGameStore((s) => s.chat.messages);
  const isLoading = useGameStore((s) => s.chat.isLoading);
  const setChatLoading = useGameStore((s) => s.setChatLoading);
  const openDiceRoller = useGameStore((s) => s.openDiceRoller);
  const charactersById = useGameStore((s) => s.characters.byId);
  const npcsById = useGameStore((s) => s.npcs.byId);
  const includeSpecialAbilityInSkillRolls = useGameStore((s) => s.ui.includeSpecialAbilityInSkillRolls);

  const messages = useMemo(() => sortChatMessagesByTimestamp(rawMessages), [rawMessages]);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.id]);

  const lastRollRequest = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === 'system' && m.metadata?.kind === 'roll_request') return m;
    }
    return null;
  }, [messages]);

  const openGmRollFromMessage = useCallback(
    (m: ChatMessage) => {
      const meta = m.metadata as Record<string, unknown> | undefined;
      if (!meta) return;
      const input = rollRequestMetadataToInput(meta);
      const cid =
        (typeof meta.characterId === 'string' && meta.characterId) || focusCharacterId || null;
      const char = cid ? charactersById[cid] ?? npcsById[cid] : null;
      const r = resolveGmRequestRoll(char, input, {
        includeSpecialAbilityInSkillRolls,
      });
      const formula = r.formula.trim();
      if (!formula) return;
      const reason = typeof meta.reason === 'string' ? meta.reason : undefined;
      openDiceRoller(formula, {
        kind: 'gm_request',
        sessionId,
        formula,
        reason,
        speakerName,
        nonBlockingUi: true,
      });
    },
    [
      focusCharacterId,
      charactersById,
      npcsById,
      includeSpecialAbilityInSkillRolls,
      sessionId,
      speakerName,
      openDiceRoller,
    ],
  );

  useEffect(() => {
    if (!lastRollRequest || !enabled) return;
    const id = lastRollRequest.id;
    if (autoOpenedRollRequestIds.has(id)) return;
    autoOpenedRollRequestIds.add(id);
    openGmRollFromMessage(lastRollRequest);
  }, [lastRollRequest, enabled, openGmRollFromMessage]);

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !enabled) return;
    setSendError(null);
    setChatLoading(true);
    try {
      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, playerMessage: text, speakerName }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSendError(data.error ?? res.statusText ?? 'Request failed');
        return;
      }
      setDraft('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatLoading(false);
    }
  }, [draft, enabled, sessionId, speakerName, setChatLoading]);

  const openRollRequestInRoller = useCallback(
    (m: ChatMessage) => {
      openGmRollFromMessage(m);
    },
    [openGmRollFromMessage],
  );

  const rollHint = useCallback(
    (m: ChatMessage) => {
      const meta = m.metadata as Record<string, unknown> | undefined;
      if (!meta) return null;
      const input = rollRequestMetadataToInput(meta);
      const cid =
        (typeof meta.characterId === 'string' && meta.characterId) || focusCharacterId || null;
      const char = cid ? charactersById[cid] ?? npcsById[cid] : null;
      const r = resolveGmRequestRoll(char, input, {
        includeSpecialAbilityInSkillRolls,
      });
      if (!r.resolvedFromCharacter || !r.label) return null;
      return r.label;
    },
    [focusCharacterId, charactersById, npcsById, includeSpecialAbilityInSkillRolls],
  );

  return (
    <section className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-900/60 min-h-[320px] max-h-[min(70vh,520px)]">
      <header className="shrink-0 border-b border-zinc-700 px-3 py-2 flex items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-widest text-zinc-400">Session chat</h2>
        {isLoading && (
          <span className="text-[10px] text-cyan-400/90 font-mono animate-pulse">AI-GM…</span>
        )}
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 text-sm"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-zinc-500 text-xs">No messages yet. Say something to the AI-GM.</p>
        ) : (
          messages.map((m) => {
            const sheetHint =
              m.type === 'system' && m.metadata?.kind === 'roll_request' ? rollHint(m) : null;
            return (
            <div
              key={m.id}
              className={`border-l-2 pl-2 py-1.5 rounded-r ${bubbleClasses(m.type, m.metadata)}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wide opacity-80">
                <span className="font-bold text-zinc-300">{m.speaker}</span>
                <span className="text-zinc-500 font-mono">{typeLabel(m.type, m.metadata)}</span>
                <span className="text-zinc-600 font-mono">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words leading-snug">{m.text}</p>
              {sheetHint && (
                <p className="mt-1 text-[10px] text-amber-200/80 font-mono">
                  Sheet match: {sheetHint}
                </p>
              )}
              {m.type === 'system' && m.metadata?.kind === 'roll_request' && (
                <button
                  type="button"
                  onClick={() => openRollRequestInRoller(m)}
                  className="mt-2 text-[10px] uppercase font-bold border border-amber-500/60 bg-amber-950/50 text-amber-200 px-2 py-1 rounded hover:bg-amber-900/40"
                >
                  Open dice roller
                </button>
              )}
            </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <footer className="shrink-0 border-t border-zinc-700 p-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={enabled ? 'Message the AI-GM…' : 'Sign in to chat'}
            disabled={!enabled || isLoading}
            className="flex-1 min-w-0 bg-zinc-950 border border-zinc-600 rounded px-2 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!enabled || isLoading || !draft.trim()}
            className="shrink-0 bg-cyan-800 hover:bg-cyan-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-bold uppercase px-4 py-2 rounded border border-cyan-600/50"
          >
            Send
          </button>
        </div>
        {sendError && <p className="text-xs text-red-400">{sendError}</p>}
      </footer>
    </section>
  );
}
