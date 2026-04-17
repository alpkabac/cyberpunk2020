'use client';

import { useEffect, useState } from 'react';

export interface FireModeTargetOption {
  id: string;
  name: string;
}

type FireModeTargetModalMode = 'ThreeRoundBurst' | 'FullAuto';

export function FireModeTargetModal(props: {
  open: boolean;
  mode: FireModeTargetModalMode;
  weaponName: string;
  burstAmmo: number;
  rof: number;
  options: FireModeTargetOption[];
  /** Pre-select (e.g. combat target). */
  initialSelectedIds: string[];
  onClose: () => void;
  onConfirm: (targetIds: string[]) => void;
}) {
  const {
    open,
    mode,
    weaponName,
    burstAmmo,
    rof,
    options,
    initialSelectedIds,
    onClose,
    onConfirm,
  } = props;

  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    if (mode === 'ThreeRoundBurst') {
      const one = initialSelectedIds[0] ?? '';
      setSelected(one ? new Set([one]) : new Set());
    } else {
      setSelected(new Set(initialSelectedIds.filter((id) => options.some((o) => o.id === id))));
    }
  }, [open, mode, initialSelectedIds, options]);

  if (!open) return null;

  const toggle = (id: string) => {
    if (mode === 'ThreeRoundBurst') {
      setSelected((prev) => (prev.has(id) ? new Set() : new Set([id])));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canConfirm =
    mode === 'ThreeRoundBurst'
      ? selected.size === 1
      : selected.size >= 1;

  const title = mode === 'ThreeRoundBurst' ? '3-round burst' : 'Full auto';
  const ammoNote =
    mode === 'ThreeRoundBurst' ? `Spends ${burstAmmo} rounds.` : `Spends ${rof} rounds (ROF).`;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="fire-mode-modal-title"
    >
      <div className="bg-[#f4f4e8] border-2 border-black max-w-md w-full shadow-xl max-h-[85vh] flex flex-col">
        <div className="border-b-2 border-black px-3 py-2 flex justify-between items-center gap-2">
          <h2 id="fire-mode-modal-title" className="text-sm font-bold uppercase">
            {title} — {weaponName}
          </h2>
          <button
            type="button"
            className="text-xs border border-black px-2 py-0.5 uppercase hover:bg-gray-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="text-[11px] px-3 pt-2 text-gray-800">{ammoNote} Rolls attack(s) and damage automatically.</p>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {options.length === 0 ? (
            <p className="text-xs text-gray-600">No other characters in session.</p>
          ) : (
            options.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 text-xs cursor-pointer select-none border border-black/20 px-2 py-1.5 hover:bg-white/80"
              >
                <input
                  type={mode === 'ThreeRoundBurst' ? 'radio' : 'checkbox'}
                  name={mode === 'ThreeRoundBurst' ? 'burst-target' : undefined}
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                  className="shrink-0"
                />
                <span>{o.name}</span>
              </label>
            ))
          )}
        </div>
        <div className="border-t-2 border-black px-3 py-2 flex gap-2 justify-end">
          <button
            type="button"
            className="text-xs border border-black px-3 py-1.5 uppercase hover:bg-gray-200"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            className="text-xs border-2 border-black px-3 py-1.5 uppercase font-bold bg-amber-100 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onConfirm(Array.from(selected))}
          >
            Fire
          </button>
        </div>
      </div>
    </div>
  );
}
