'use client';

import { useState, useCallback } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { rollDice } from '@/lib/game-logic/dice';
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
  const [prevDiceFormula, setPrevDiceFormula] = useState<string | null>(null);

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
  }, []);

  if (isDiceRollerOpen && diceFormula && diceFormula !== prevDiceFormula) {
    setPrevDiceFormula(diceFormula);
    setCustomFormula(diceFormula);
    doRoll(diceFormula);
  }
  if (!isDiceRollerOpen && prevDiceFormula !== null) {
    setPrevDiceFormula(null);
  }

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] border-4 border-cyan-500 w-full max-w-md shadow-2xl shadow-cyan-500/20">
        {/* Header */}
        <div className="border-b-2 border-cyan-500 p-4 flex justify-between items-center bg-[#16213e]">
          <h2 className="text-xl font-bold uppercase text-cyan-400 tracking-wider">Dice Roller</h2>
          <button
            onClick={closeDiceRoller}
            className="text-2xl font-bold text-gray-400 hover:text-red-500 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Last Roll Result */}
        <div className="p-6 text-center">
          {lastRoll ? (
            <div>
              <div className="text-sm text-gray-400 uppercase mb-1">{lastRoll.formula}</div>
              <div
                className={`text-7xl font-bold text-white transition-transform ${
                  isAnimating ? 'scale-125' : 'scale-100'
                }`}
                style={{ textShadow: '0 0 20px rgba(0, 255, 255, 0.5)' }}
              >
                {lastRoll.result.total}
              </div>
              {lastRoll.result.rolls.length > 1 && (
                <div className="text-sm text-gray-500 mt-2">
                  Rolls: [{lastRoll.result.rolls.join(', ')}]
                </div>
              )}
              {lastRoll.result.rolls.length === 1 && lastRoll.result.rolls[0] !== lastRoll.result.total && (
                <div className="text-sm text-gray-500 mt-2">
                  Roll: {lastRoll.result.rolls[0]}
                  {lastRoll.result.total - lastRoll.result.rolls[0] > 0
                    ? ` + ${lastRoll.result.total - lastRoll.result.rolls[0]}`
                    : ` - ${lastRoll.result.rolls[0] - lastRoll.result.total}`}
                </div>
              )}
              {lastRoll.result.rolls.some((r) => r >= 10) && (
                <div className="text-xs text-yellow-400 mt-1 font-bold uppercase">
                  Exploding!
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 text-lg">Roll some dice</div>
          )}
        </div>

        {/* Custom Formula */}
        <div className="px-4 pb-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={customFormula}
              onChange={(e) => setCustomFormula(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 2d6+3, 1d10+8"
              className="flex-1 bg-[#0f3460] border-2 border-cyan-700 text-white px-3 py-2 font-mono placeholder-gray-600 focus:border-cyan-400 focus:outline-none"
            />
            <button
              onClick={handleCustomRoll}
              className="bg-cyan-600 hover:bg-cyan-500 text-white border-2 border-cyan-400 px-6 py-2 font-bold uppercase tracking-wider transition-colors"
            >
              Roll
            </button>
          </div>
        </div>

        {/* Quick Roll Buttons */}
        <div className="px-4 pb-3">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleQuickRoll('1d10')}
              className="bg-[#0f3460] border border-cyan-800 text-cyan-300 p-2 font-bold hover:bg-cyan-900 transition-colors"
            >
              1d10
            </button>
            <button
              onClick={() => handleQuickRoll('2d6')}
              className="bg-[#0f3460] border border-cyan-800 text-cyan-300 p-2 font-bold hover:bg-cyan-900 transition-colors"
            >
              2d6
            </button>
            <button
              onClick={() => handleQuickRoll('3d6')}
              className="bg-[#0f3460] border border-cyan-800 text-cyan-300 p-2 font-bold hover:bg-cyan-900 transition-colors"
            >
              3d6
            </button>
            <button
              onClick={() => handleQuickRoll('4d6')}
              className="bg-[#0f3460] border border-cyan-800 text-cyan-300 p-2 font-bold hover:bg-cyan-900 transition-colors"
            >
              4d6
            </button>
          </div>
        </div>

        {/* Re-roll Last */}
        {lastRoll && (
          <div className="px-4 pb-3">
            <button
              onClick={() => doRoll(lastRoll.formula)}
              className="w-full bg-[#1a1a2e] border-2 border-yellow-600 text-yellow-400 p-2 font-bold uppercase hover:bg-yellow-900/20 transition-colors"
            >
              Re-roll {lastRoll.formula}
            </button>
          </div>
        )}

        {/* Roll History */}
        {rollHistory.length > 1 && (
          <div className="border-t border-cyan-900 px-4 py-3 max-h-32 overflow-y-auto">
            <div className="text-xs text-gray-600 uppercase mb-1">History</div>
            <div className="space-y-1">
              {rollHistory.slice(1, 8).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => doRoll(entry.formula)}
                  className="w-full flex justify-between text-sm text-gray-400 hover:text-cyan-300 transition-colors"
                >
                  <span className="font-mono">{entry.formula}</span>
                  <span className="font-bold">{entry.result.total}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
