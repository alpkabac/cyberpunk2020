'use client';

import { useGameStore } from '@/lib/store/game-store';
import { useShallow } from 'zustand/react/shallow';

/**
 * Pause between start-of-turn stun recovery and the chained ongoing death save.
 */
export function StartOfTurnDeathSaveAck() {
  const { ack, charName, proceed, dismiss } = useGameStore(
    useShallow((s) => {
      const id = s.ui.startOfTurnDeathSaveAck?.characterId ?? null;
      const c = id ? (s.characters.byId[id] ?? s.npcs.byId[id]) : null;
      return {
        ack: s.ui.startOfTurnDeathSaveAck,
        charName: c?.name ?? 'Character',
        proceed: s.proceedStartOfTurnDeathSaveAfterAck,
        dismiss: s.dismissStartOfTurnDeathSaveAck,
      };
    }),
  );

  if (!ack) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sot-death-ack-title"
    >
      <div className="w-full max-w-md rounded-lg border border-amber-700/60 bg-zinc-950 shadow-xl p-4 space-y-3">
        <h2 id="sot-death-ack-title" className="text-sm font-semibold text-amber-100">
          Stun recovery done
        </h2>
        <p className="text-xs text-zinc-300 leading-relaxed">
          <span className="font-medium text-zinc-100">{charName}</span> — next is the{' '}
          <span className="text-amber-200/90">ongoing death save</span> (mortal wound). On a flat d10 you need{' '}
          <span className="text-zinc-100 font-medium">≤ your death-save target</span> (Body Type − mortal level, plus
          any sheet mods) — low rolls succeed; surviving does not heal damage.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] uppercase py-2 px-3 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={proceed}
            className="text-[11px] uppercase py-2 px-3 rounded border border-amber-600/80 text-amber-50 bg-amber-950/50 hover:bg-amber-900/40"
          >
            Roll death save
          </button>
        </div>
      </div>
    </div>
  );
}
