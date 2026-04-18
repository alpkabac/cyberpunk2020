'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character, CharacterCondition, Token } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';

const CONDITION_COLORS: Record<string, string> = {
  unconscious: 'bg-purple-900/70 text-purple-200 border-purple-600/60',
  asleep: 'bg-purple-900/70 text-purple-200 border-purple-600/60',
  blinded: 'bg-yellow-900/70 text-yellow-200 border-yellow-600/60',
  deafened: 'bg-yellow-900/70 text-yellow-200 border-yellow-600/60',
  on_fire: 'bg-red-900/70 text-red-200 border-red-600/60',
  poisoned: 'bg-green-900/70 text-green-200 border-green-600/60',
  drugged: 'bg-green-900/70 text-green-200 border-green-600/60',
  cyberpsychosis: 'bg-pink-900/70 text-pink-200 border-pink-600/60',
  stunned: 'bg-orange-900/70 text-orange-200 border-orange-600/60',
  severed_right_arm: 'bg-red-950 text-red-100 border-red-800',
  severed_left_arm: 'bg-red-950 text-red-100 border-red-800',
  severed_right_leg: 'bg-red-950 text-red-100 border-red-800',
  severed_left_leg: 'bg-red-950 text-red-100 border-red-800',
};
const DEFAULT_CHIP = 'bg-zinc-700/80 text-zinc-200 border-zinc-600/60';

const WOUND_COLORS: Record<string, string> = {
  Uninjured: 'text-emerald-400',
  Light: 'text-yellow-300',
  Serious: 'text-orange-400',
  Critical: 'text-red-400',
  Dead: 'text-zinc-500',
};
function woundColor(ws: string | undefined): string {
  if (!ws) return 'text-zinc-400';
  if (ws.startsWith('Mortal')) return 'text-red-500';
  return WOUND_COLORS[ws] ?? 'text-zinc-400';
}

const COMMON_CONDITIONS = [
  'blinded', 'deafened', 'unconscious', 'asleep', 'on_fire',
  'prone', 'grappled', 'poisoned', 'drugged', 'cyberpsychosis',
];

const MAX_DAMAGE = 40;

export interface TokenContextCardProps {
  token: Token;
  character: Character | null;
  canEdit: boolean;
  /** Any session participant may remove a map token (does not delete the character row). */
  canRemoveFromMap?: boolean;
  removeFromMapBusy?: boolean;
  onRemoveFromMap?: () => void;
  supabase: SupabaseClient;
  sessionId: string;
  onViewSheet: () => void;
  onClose: () => void;
}

export function TokenContextCard({
  token,
  character,
  canEdit,
  canRemoveFromMap = false,
  removeFromMapBusy = false,
  onRemoveFromMap,
  supabase,
  sessionId,
  onViewSheet,
  onClose,
}: TokenContextCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [condInput, setCondInput] = useState(COMMON_CONDITIONS[0]);
  const [customCond, setCustomCond] = useState('');
  const [durInput, setDurInput] = useState('');
  const [busy, setBusy] = useState(false);

  const updateCharacterField = useGameStore((s) => s.updateCharacterField);

  const isCustom = condInput === '__custom';

  // Dismiss on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const woundState = character?.derivedStats?.woundState;
  const damage = character?.damage ?? 0;
  const conditions: CharacterCondition[] = character?.conditions ?? [];
  const isStunned = character?.isStunned ?? false;
  const isStabilized = character?.isStabilized ?? false;

  const removeCondition = async (name: string) => {
    if (!character) return;
    const next = conditions.filter((c) => c.name !== name);
    updateCharacterField(character.id, 'conditions', next);
    await supabase.from('characters').update({ conditions: next }).eq('id', character.id).eq('session_id', sessionId);
  };

  const handleAddCondition = async () => {
    if (!character) return;
    const raw = isCustom ? customCond : condInput;
    const name = raw.toLowerCase().trim().replace(/\s+/g, '_');
    if (!name) return;
    setBusy(true);
    try {
      const dur = durInput.trim() ? parseInt(durInput, 10) : null;
      const duration = dur !== null && Number.isFinite(dur) && dur > 0 ? dur : null;
      const entry: CharacterCondition = { name, duration };
      const idx = conditions.findIndex((c) => c.name === name);
      const next = [...conditions];
      if (idx !== -1) {
        next[idx] = entry;
      } else {
        next.push(entry);
      }
      updateCharacterField(character.id, 'conditions', next);
      await supabase.from('characters').update({ conditions: next }).eq('id', character.id).eq('session_id', sessionId);
      setShowAdd(false);
      setCustomCond('');
      setDurInput('');
    } finally {
      setBusy(false);
    }
  };

  // Position: offset from token's %, clamped so card stays near token but readable
  // We position via inline style; parent must be relative-positioned over the map board
  const cardLeft = Math.min(token.x + 3, 68);
  const cardTop = Math.min(token.y - 2, 70);

  const roleBadge =
    token.controlledBy === 'gm'
      ? 'bg-amber-900/60 text-amber-200 border-amber-700/50'
      : character?.type === 'npc'
        ? 'bg-violet-900/50 text-violet-200 border-violet-700/40'
        : 'bg-cyan-900/50 text-cyan-200 border-cyan-700/40';
  const roleLabel = token.controlledBy === 'gm' ? 'GM' : character?.type === 'npc' ? 'NPC' : 'PC';

  const hpPct = Math.min(100, Math.round((damage / MAX_DAMAGE) * 100));
  const hpBarColor =
    hpPct >= 80 ? 'bg-red-600' : hpPct >= 50 ? 'bg-orange-500' : hpPct >= 25 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div
      ref={cardRef}
      className="absolute z-20 w-52 rounded border border-zinc-700 bg-zinc-950/95 shadow-xl text-[11px] pointer-events-auto"
      style={{ left: `${cardLeft}%`, top: `${cardTop}%` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded border ${roleBadge}`}>{roleLabel}</span>
          <span className="font-semibold text-zinc-100 truncate">{token.name}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-zinc-500 hover:text-zinc-200 leading-none px-0.5"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="px-2 py-2 space-y-2">
        {character ? (
          <>
            {/* Wound state */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className={`font-semibold ${woundColor(woundState)}`}>
                {woundState ?? 'Unknown'}
              </span>
              <span className="flex flex-wrap gap-1 justify-end">
                {isStunned && (
                  <span className="text-[9px] uppercase bg-orange-900/60 text-orange-200 border border-orange-700/50 px-1 py-0.5 rounded">
                    Stunned
                  </span>
                )}
                {isStabilized &&
                  woundState &&
                  woundState !== 'Dead' &&
                  woundState.startsWith('Mortal') && (
                    <span
                      className="text-[9px] uppercase bg-teal-900/60 text-teal-100 border border-teal-600/50 px-1 py-0.5 rounded"
                      title="Stabilized — ongoing death saves off until new damage"
                    >
                      Stabilized
                    </span>
                  )}
              </span>
            </div>

            {/* HP bar */}
            <div>
              <div className="flex justify-between text-zinc-500 mb-0.5">
                <span>Damage</span>
                <span>{damage} / {MAX_DAMAGE}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${hpBarColor}`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
            </div>

            {/* Conditions */}
            {conditions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {conditions.map((c) => (
                  <span
                    key={c.name}
                    className={`flex items-center gap-0.5 text-[9px] uppercase font-medium px-1 py-0.5 rounded border ${
                      CONDITION_COLORS[c.name] ?? DEFAULT_CHIP
                    }`}
                  >
                    {c.name.replace(/_/g, ' ')}
                    {c.duration !== null && <span className="opacity-60"> ·{c.duration}r</span>}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void removeCondition(c.name)}
                        className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
                        aria-label={`Remove ${c.name}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Add condition */}
            {canEdit && !showAdd && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="text-[10px] text-zinc-500 hover:text-cyan-300 border border-dashed border-zinc-700 rounded px-1.5 py-0.5 w-full text-center hover:border-cyan-700"
              >
                + Condition
              </button>
            )}
            {canEdit && showAdd && (
              <div className="space-y-1">
                <select
                  value={condInput}
                  onChange={(e) => setCondInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200"
                >
                  {COMMON_CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                  <option value="__custom">Custom…</option>
                </select>
                {isCustom && (
                  <input
                    type="text"
                    placeholder="Condition name"
                    value={customCond}
                    onChange={(e) => setCustomCond(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200"
                  />
                )}
                <input
                  type="number"
                  min={1}
                  placeholder="Rounds (optional)"
                  value={durInput}
                  onChange={(e) => setDurInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleAddCondition()}
                    className="flex-1 bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 rounded px-1.5 py-0.5 hover:bg-cyan-800/60 disabled:opacity-40"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAdd(false); setCustomCond(''); setDurInput(''); }}
                    className="flex-1 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-zinc-500">GM marker — no sheet.</p>
        )}

        {/* View sheet */}
        {character && (
          <button
            type="button"
            onClick={() => { onViewSheet(); onClose(); }}
            className="w-full text-center text-[10px] uppercase font-bold text-violet-300 hover:text-violet-100 border border-violet-800/50 rounded px-1.5 py-1 hover:bg-violet-950/40"
          >
            View sheet ↗
          </button>
        )}

        {canRemoveFromMap && onRemoveFromMap && (
          <button
            type="button"
            disabled={removeFromMapBusy}
            onClick={() => onRemoveFromMap()}
            className="w-full text-center text-[10px] uppercase font-bold text-red-300/90 hover:text-red-200 border border-red-900/50 rounded px-1.5 py-1 hover:bg-red-950/35 disabled:opacity-50"
          >
            {removeFromMapBusy ? '…' : 'Remove from map'}
          </button>
        )}
      </div>
    </div>
  );
}
