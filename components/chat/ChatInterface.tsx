'use client';

import { useMemo, useState } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { sortChatMessagesByTimestamp } from '@/lib/chat/chat-order';
import type { ChatMessage, DiceRollIntent } from '@/lib/types';
import {
  resolveGmRequestRoll,
  rollRequestMetadataToInput,
} from '@/lib/game-logic/resolve-gm-request-roll';
import { getAccessTokenForApi } from '@/lib/auth/client-access-token';
import { supabase } from '@/lib/supabase';

/** Auto-open the dice UI only for the client whose focused character matches the request. */
function rollRequestTargetsFocusedCharacter(m: ChatMessage, focusCharacterId: string | null): boolean {
  const meta = m.metadata as Record<string, unknown> | undefined;
  if (!meta || meta.kind !== 'roll_request') return false;
  const rid =
    typeof meta.characterId === 'string' && meta.characterId.trim() ? meta.characterId.trim() : null;
  if (!rid) return false;
  if (!focusCharacterId || !focusCharacterId.trim()) return false;
  return rid === focusCharacterId.trim();
}

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

type ChatImgSegment = { kind: 'text'; text: string } | { kind: 'img'; alt: string; src: string };

/** Renders `![alt](https://...)` as inline images; other text stays plain. */
function segmentChatTextWithMarkdownImages(text: string): ChatImgSegment[] {
  const out: ChatImgSegment[] = [];
  const re = /!\[([^\]]*)\]\((https:[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const t = text.slice(last, m.index);
      if (t) out.push({ kind: 'text', text: t });
    }
    out.push({ kind: 'img', alt: m[1], src: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) {
    const t = text.slice(last);
    if (t) out.push({ kind: 'text', text: t });
  }
  return out.length ? out : [{ kind: 'text', text }];
}

function ChatMessageBody({ text }: { text: string }) {
  const segments = segmentChatTextWithMarkdownImages(text);
  if (segments.length === 1 && segments[0].kind === 'text') {
    return <p className="mt-1 whitespace-pre-wrap wrap-break-word leading-snug">{segments[0].text}</p>;
  }
  return (
    <div className="mt-1 space-y-2 wrap-break-word leading-snug">
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <p key={i} className="whitespace-pre-wrap">
            {s.text}
          </p>
        ) : (
          <img
            key={i}
            src={s.src}
            alt={s.alt || 'Image'}
            className="max-w-full max-h-72 rounded border border-zinc-600/50 object-contain bg-black/20"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ),
      )}
    </div>
  );
}

function isStoryFocusedMessage(m: ChatMessage): boolean {
  if (m.type === 'player' || m.type === 'narration' || m.type === 'roll') return true;
  if (m.type === 'system') return m.metadata?.kind === 'roll_request';
  return false;
}

export interface ChatInterfaceProps {
  sessionId: string;
  speakerName: string;
  enabled?: boolean;
  isGm?: boolean;
  focusCharacterId?: string | null;
}

export function ChatInterface({
  sessionId,
  speakerName,
  enabled = true,
  isGm = false,
  focusCharacterId = null,
}: ChatInterfaceProps) {
  const rawMessages = useGameStore((s) => s.chat.messages);
  const openDiceRoller = useGameStore((s) => s.openDiceRoller);
  const mergeRemoteChatMessage = useGameStore((s) => s.mergeRemoteChatMessage);
  const removeChatMessagesByIds = useGameStore((s) => s.removeChatMessagesByIds);
  const includeSpecialAbilityInSkillRolls = useGameStore((s) => s.ui.includeSpecialAbilityInSkillRolls);

  const [draft, setDraft] = useState('');
  const [sendAsGm, setSendAsGm] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [chatActionError, setChatActionError] = useState<string | null>(null);
  const [showSystemLog, setShowSystemLog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [sending, setSending] = useState(false);

  const messages = useMemo(() => sortChatMessagesByTimestamp(rawMessages), [rawMessages]);
  const displayedMessages = useMemo(
    () => (showSystemLog ? messages : messages.filter(isStoryFocusedMessage)),
    [messages, showSystemLog],
  );
  const hiddenMessageCount = messages.length - displayedMessages.length;

  async function authToken(): Promise<string | null> {
    const token = await getAccessTokenForApi(supabase);
    if (!token) setSendError('Not signed in');
    return token;
  }

  const submitMessage = async () => {
    const text = draft.trim();
    if (!text || !enabled || sending) return;
    setSendError(null);
    setSending(true);
    try {
      const token = await authToken();
      if (!token) return;
      const res = await fetch('/api/session/chat-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          text,
          speaker: sendAsGm && isGm ? 'Game Master' : speakerName,
          type: sendAsGm && isGm ? 'narration' : 'player',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: ChatMessage };
      if (!res.ok) {
        setSendError(data.error ?? res.statusText);
        return;
      }
      if (data.message) mergeRemoteChatMessage(data.message);
      setDraft('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const patchMessage = async (messageId: string, text: string) => {
    setChatActionError(null);
    try {
      const token = await authToken();
      if (!token) return;
      const res = await fetch('/api/session/chat-message', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, messageId, text }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: ChatMessage };
      if (!res.ok) {
        setChatActionError(data.error ?? res.statusText);
        return;
      }
      if (data.message) mergeRemoteChatMessage(data.message);
      setEditingId(null);
      setEditingDraft('');
    } catch (e) {
      setChatActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteMessage = async (messageId: string) => {
    setChatActionError(null);
    try {
      const token = await authToken();
      if (!token) return;
      const url = `/api/session/chat-message?sessionId=${encodeURIComponent(sessionId)}&messageId=${encodeURIComponent(messageId)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; deletedId?: string };
      if (!res.ok) {
        setChatActionError(data.error ?? res.statusText);
        return;
      }
      removeChatMessagesByIds([data.deletedId ?? messageId]);
    } catch (e) {
      setChatActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const openRollRequest = (message: ChatMessage) => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    if (!meta || meta.kind !== 'roll_request') return;
    const input = rollRequestMetadataToInput(meta);
    const characterId = rollRequestTargetsFocusedCharacter(message, focusCharacterId)
      ? focusCharacterId
      : input.character_id;
    const store = useGameStore.getState();
    const character =
      typeof characterId === 'string'
        ? store.characters.byId[characterId] ?? store.npcs.byId[characterId] ?? null
        : null;
    const resolved = resolveGmRequestRoll(character, input, { includeSpecialAbilityInSkillRolls });
    if (!resolved.formula) {
      setChatActionError('Could not resolve requested roll.');
      return;
    }
    const intent: DiceRollIntent = resolved.attackDice
      ? {
          kind: 'attack',
          ...resolved.attackDice,
          sessionId,
          speakerName,
          rollSummary: resolved.label ?? 'Attack roll',
          gmRequestChatMessageId: message.id,
          nonBlockingUi: true,
        }
      : {
          kind: 'gm_request',
          sessionId,
          formula: resolved.formula,
          speakerName,
          rollSummary: resolved.label ?? input.formula ?? 'Requested roll',
          reason: resolved.label ?? undefined,
          nonBlockingUi: true,
        };
    openDiceRoller(resolved.formula, intent);
  };

  return (
    <section className="h-full min-h-0 flex flex-col rounded border border-zinc-800 bg-zinc-950/80 overflow-hidden">
      <header className="shrink-0 border-b border-zinc-800 px-3 py-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-zinc-300">Table Chat</h2>
          <p className="text-[10px] text-zinc-500">Players, GM lines, dice, and system log.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSystemLog((v) => !v)}
          className="text-[10px] uppercase tracking-wide px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
        >
          {showSystemLog ? 'Story' : `Log${hiddenMessageCount > 0 ? ` ${hiddenMessageCount}` : ''}`}
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 text-sm">
        {displayedMessages.length === 0 ? (
          <p className="text-xs text-zinc-500">No table messages yet.</p>
        ) : (
          displayedMessages.map((m) => {
            const isEditing = editingId === m.id;
            const canEdit = m.type === 'player';
            const canDelete = isGm;
            return (
              <article
                key={m.id}
                className={`group flex items-stretch min-h-9 rounded-r border-l-2 ${bubbleClasses(m.type, m.metadata)}`}
              >
                <div className="flex-1 min-w-0 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide">
                    <span className="truncate text-zinc-400">{m.speaker}</span>
                    <span className="text-zinc-500 font-mono">{typeLabel(m.type, m.metadata)}</span>
                  </div>
                  {isEditing ? (
                    <div className="mt-1 space-y-1">
                      <textarea
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        className="w-full min-h-20 resize-y rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-100"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void patchMessage(m.id, editingDraft.trim())}
                          className="text-[10px] uppercase px-2 py-1 rounded bg-cyan-700 text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingDraft('');
                          }}
                          className="text-[10px] uppercase px-2 py-1 rounded border border-zinc-700 text-zinc-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ChatMessageBody text={m.text} />
                  )}
                  {m.type === 'system' && m.metadata?.kind === 'roll_request' && (
                    <button
                      type="button"
                      onClick={() => openRollRequest(m)}
                      className="mt-2 text-[10px] uppercase tracking-wide px-2 py-1 rounded border border-amber-500/50 text-amber-100 hover:bg-amber-950/50"
                    >
                      Open roll
                    </button>
                  )}
                </div>
                {(canEdit || canDelete) && !isEditing && (
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col border-l border-zinc-800">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditingDraft(m.text);
                        }}
                        className="px-2 py-1 text-[10px] text-zinc-400 hover:text-cyan-200"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void deleteMessage(m.id)}
                        className="px-2 py-1 text-[10px] text-zinc-400 hover:text-rose-200"
                      >
                        Del
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      <footer className="shrink-0 border-t border-zinc-800 p-2 space-y-2">
        {isGm && (
          <label className="flex items-center gap-2 text-[11px] text-zinc-300">
            <input
              type="checkbox"
              checked={sendAsGm}
              onChange={(e) => setSendAsGm(e.target.checked)}
              className="accent-violet-500"
            />
            Send as Game Master
          </label>
        )}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void submitMessage();
              }
            }}
            disabled={!enabled || sending}
            placeholder={sendAsGm && isGm ? 'GM narration...' : 'Message the table...'}
            className="min-h-16 flex-1 resize-none rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!enabled || sending || draft.trim().length === 0}
            onClick={() => void submitMessage()}
            className="self-stretch px-3 rounded bg-cyan-700 text-xs uppercase tracking-wide text-white hover:bg-cyan-600 disabled:opacity-50"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        {(sendError || chatActionError) && (
          <p className="text-[11px] text-rose-400">{sendError ?? chatActionError}</p>
        )}
      </footer>
    </section>
  );
}
