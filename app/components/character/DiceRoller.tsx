'use client';

import { useState, useCallback, useEffect } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { rollDice } from '@/lib/game-logic/dice';
import { resolveAttackFumbleOutcome } from '@/lib/game-logic/fumbles';
import { RollResult } from '@/lib/types';

interface DiceRollEntry {
  id: number;
  formula: string;
  result: RollResult;
  timestamp: number;
}

export function DiceRoller() {
  const isDiceRollerOpen = useGameStore((state) => state.ui.isDiceRollerOpen);
  const diceFormula = useGameStore((state) => state.ui.diceFormula);
  const closeDiceRoller = useGameStore((state) => state.closeDiceRoller);

  const [customFormula, setCustomFormula] = useState('');
  const [rollHistory, setRollHistory] = useState<DiceRollEntry[]>([]);
  const [lastRoll, setLastRoll] = useState<DiceRollEntry | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [fumbleLines, setFumbleLines] = useState<string[] | null>(null);
  const [stabilizationOutcome, setStabilizationOutcome] = useState<{
    target: number;
    success: boolean;
  } | null>(null);
  const [gmSubmitError, setGmSubmitError] = useState<string | null>(null);
  const [gmSubmitting, setGmSubmitting] = useState(false);

  const doRoll = useCallback((formula: string) => {
    const result = rollDice(formula);
    if (!result) return;

    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    const entry: DiceRollEntry = {
      id: Date.now(),
      formula,
      result,
      timestamp: Date.now(),
    };

    setLastRoll(entry);
    setRollHistory((prev) => [entry, ...prev].slice(0, 20));

    const intent = useGameStore.getState().ui.diceRollIntent;
    const isFlat = formula.trim().toLowerCase().startsWith('flat:');

    if (!isFlat && intent?.kind === 'attack' && result.firstD10Face === 1) {
      setFumbleLines(resolveAttackFumbleOutcome(intent.isMelee, intent.reliability).lines);
    } else {
      setFumbleLines(null);
    }

    if (intent?.kind === 'stabilization') {
      setStabilizationOutcome({
        target: intent.targetDamage,
        success: result.total >= intent.targetDamage,
      });
    } else {
      setStabilizationOutcome(null);
    }

    if (intent?.kind === 'gm_request') {
      const { sessionId, reason, speakerName } = intent;
      const playerMessage = `[Roll] ${formula} = ${result.total} (dice: ${result.rolls.join(', ')})${reason ? ` — ${reason}` : ''}`;
      void (async () => {
        setGmSubmitError(null);
        setGmSubmitting(true);
        try {
          const res = await fetch('/api/gm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, playerMessage, speakerName }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            setGmSubmitError(data.error ?? res.statusText ?? 'Request failed');
            return;
          }
          const store = useGameStore.getState();
          store.clearDiceRollIntent();
          store.closeDiceRoller();
        } catch (e) {
          setGmSubmitError(e instanceof Error ? e.message : String(e));
        } finally {
          setGmSubmitting(false);
        }
      })();
      return;
    }

    if (intent && isFlat) {
      const store = useGameStore.getState();
      if (intent.kind === 'stun') {
        store.applyStunSaveRollResult(intent.characterId, result.total);
      } else if (intent.kind === 'death') {
        store.applyDeathSaveRollResult(intent.characterId, result.total);
      }
      store.clearDiceRollIntent();
    }
  }, []);

  // Auto-roll when the store opens the modal with a formula. Must not run during render (Zustand →
  // updateCharacterField caused "Cannot update CharacterDemoPage while rendering DiceRoller").
  // Defer one frame so we don't sync setState + store updates in the same effect tick (react-compiler lint).
  useEffect(() => {
    if (!isDiceRollerOpen || !diceFormula) return;
    const id = requestAnimationFrame(() => {
      setCustomFormula(diceFormula);
      doRoll(diceFormula);
    });
    return () => cancelAnimationFrame(id);
  }, [isDiceRollerOpen, diceFormula, doRoll]);

  const handleClose = useCallback(() => {
    setFumbleLines(null);
    setStabilizationOutcome(null);
    setGmSubmitError(null);
    setGmSubmitting(false);
    closeDiceRoller();
  }, [closeDiceRoller]);

  const handleQuickRoll = (formula: string) => {
    setCustomFormula(formula);
    doRoll(formula);
  };

  const handleCustomRoll = () => {
    if (customFormula.trim()) {
      doRoll(customFormula.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomRoll();
    }
  };

  if (!isDiceRollerOpen) return null;

  const displayFormula = (f: string) =>
    f.toLowerCase().startsWith('flat:')
      ? `${f.replace(/^flat:/i, '').trim()} · flat (save)`
      : f;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      aria-modal="true"
      role="dialog"
    >
      {/* Light scrim — sheet stays visible; only slight dim */}
      <button
        type="button"
        className="absolute inset-0 bg-black/15 pointer-events-auto cursor-default"
        onClick={handleClose}
        aria-label="Close dice roller"
      />

      <div
        className="relative pointer-events-auto w-full max-w-md bg-[#f5f5dc] border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,0.85)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-4 border-black p-3 flex justify-between items-center bg-[#e8e8d0] shrink-0">
          <h2 className="text-lg font-bold uppercase tracking-wide">Dice roller</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-2xl font-bold leading-none px-2 hover:bg-black hover:text-white border-2 border-black"
          >
            ×
          </button>
        </div>

        <div className="p-4 text-center overflow-y-auto flex-1 min-h-0">
          {lastRoll ? (
            <div>
              <div className="text-xs font-mono text-gray-700 uppercase mb-1 break-all">
                {displayFormula(lastRoll.formula)}
              </div>
              <div
                className={`text-6xl sm:text-7xl font-bold text-black transition-transform ${
                  isAnimating ? 'scale-105' : 'scale-100'
                }`}
              >
                {lastRoll.result.total}
              </div>
              {lastRoll.result.rolls.length > 1 && (
                <div className="text-sm text-gray-700 mt-2 font-mono">
                  Rolls: [{lastRoll.result.rolls.join(', ')}]
                </div>
              )}
              {lastRoll.result.rolls.length === 1 && lastRoll.result.rolls[0] !== lastRoll.result.total && (
                <div className="text-sm text-gray-700 mt-2 font-mono">
                  Roll: {lastRoll.result.rolls[0]}
                  {lastRoll.result.total - lastRoll.result.rolls[0] > 0
                    ? ` + ${lastRoll.result.total - lastRoll.result.rolls[0]}`
                    : ` − ${lastRoll.result.rolls[0] - lastRoll.result.total}`}
                </div>
              )}
              {fumbleLines && fumbleLines.length > 0 && (
                <div className="mt-3 text-left border-2 border-red-900 bg-red-50 p-2 text-xs space-y-1">
                  <div className="font-bold uppercase text-red-950">Natural 1 — fumble</div>
                  {fumbleLines.map((line, i) => (
                    <p key={i} className="text-gray-900">
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {stabilizationOutcome && (
                <div
                  className={`mt-3 text-left border-2 p-2 text-xs ${
                    stabilizationOutcome.success
                      ? 'border-green-800 bg-green-50'
                      : 'border-amber-900 bg-amber-50'
                  }`}
                >
                  <div className="font-bold uppercase text-gray-900">Stabilization</div>
                  <p className="text-gray-800">
                    Need total ≥ <strong>{stabilizationOutcome.target}</strong> (patient damage).
                  </p>
                  <p className="font-semibold text-gray-900">
                    {stabilizationOutcome.success
                      ? 'Success — patient stabilized (no more death saves until hurt again; GM).'
                      : 'Failed — try again when rules allow, or other care.'}
                  </p>
                </div>
              )}
              {lastRoll.result.hadExplodingD10 &&
                !lastRoll.formula.toLowerCase().startsWith('flat:') && (
                  <div className="mt-3 text-left space-y-1">
                    <div className="text-xs text-amber-950 font-bold uppercase border-2 border-black inline-block px-2 py-0.5 bg-amber-100">
                      Rolled a 10 — extra d10(s) included (FNFF)
                    </div>
                    {lastRoll.result.explodingD10Chains &&
                      lastRoll.result.explodingD10Chains.length > 0 && (
                      <div className="text-xs text-gray-800 font-mono">
                        {lastRoll.result.explodingD10Chains.map((faces, i) => (
                          <span key={i} className="block">
                            {faces.length > 1 ? (
                              <>
                                d10 chain: {faces.join(' + ')} = {faces.reduce((a, b) => a + b, 0)}
                              </>
                            ) : (
                              <>d10: {faces[0]}</>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              {lastRoll.formula.toLowerCase().startsWith('flat:') && (
                <div className="text-xs text-gray-600 mt-2">
                  Single d10 — no explosion (compare to save target)
                </div>
              )}
              {gmSubmitting && (
                <div className="mt-3 text-xs text-gray-700 font-mono">Sending result to AI-GM…</div>
              )}
              {gmSubmitError && (
                <div className="mt-3 text-left border-2 border-red-800 bg-red-50 text-red-900 text-xs p-2">
                  {gmSubmitError}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-600 text-sm py-6">Roll or enter a formula</div>
          )}
        </div>

        <div className="px-4 pb-3 border-t-2 border-black/10 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={customFormula}
              onChange={(e) => setCustomFormula(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 1d10+12, 2d6+3, flat:1d10"
              className="flex-1 border-2 border-black px-3 py-2 font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/20"
            />
            <button
              type="button"
              onClick={handleCustomRoll}
              className="bg-black text-white border-2 border-black px-4 py-2 font-bold uppercase text-sm hover:bg-gray-800 shrink-0"
            >
              Roll
            </button>
          </div>
        </div>

        <div className="px-4 pb-3 shrink-0">
          <div className="grid grid-cols-4 gap-2">
            {(['1d10', '2d6', '3d6', '4d6'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => handleQuickRoll(f)}
                className="border-2 border-black bg-white py-2 font-bold text-sm hover:bg-[#e8e8d0]"
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {lastRoll && (
          <div className="px-4 pb-3 shrink-0">
            <button
              type="button"
              onClick={() => doRoll(lastRoll.formula)}
              className="w-full border-2 border-black bg-amber-100 py-2 font-bold uppercase text-sm hover:bg-amber-200"
            >
              Re-roll ({displayFormula(lastRoll.formula)})
            </button>
          </div>
        )}

        {rollHistory.length > 1 && (
          <div className="border-t-2 border-black px-4 py-2 max-h-28 overflow-y-auto bg-white/50 shrink-0">
            <div className="text-xs font-bold uppercase text-gray-600 mb-1">History</div>
            <div className="space-y-1">
              {rollHistory.slice(1, 8).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => doRoll(entry.formula)}
                  className="w-full flex justify-between text-sm font-mono text-left hover:bg-[#e8e8d0] px-1 py-0.5 border border-transparent hover:border-black"
                >
                  <span className="truncate mr-2">{displayFormula(entry.formula)}</span>
                  <span className="font-bold shrink-0">{entry.result.total}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
