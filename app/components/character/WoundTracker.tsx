'use client';

import React, { useState } from 'react';
import { Character, CharacterCondition } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';

interface WoundTrackerProps {
  character: Character;
  editable: boolean;
}

const CONDITION_COLORS: Record<string, string> = {
  unconscious: 'bg-purple-200 text-purple-800 border-purple-400',
  asleep: 'bg-purple-200 text-purple-800 border-purple-400',
  blinded: 'bg-yellow-200 text-yellow-900 border-yellow-500',
  deafened: 'bg-yellow-200 text-yellow-900 border-yellow-500',
  on_fire: 'bg-red-200 text-red-800 border-red-500',
  poisoned: 'bg-green-200 text-green-800 border-green-500',
  drugged: 'bg-green-200 text-green-800 border-green-500',
  cyberpsychosis: 'bg-pink-200 text-pink-800 border-pink-500',
};
const DEFAULT_BADGE = 'bg-gray-200 text-gray-700 border-gray-400';

const COMMON_CONDITIONS = [
  'blinded', 'deafened', 'unconscious', 'asleep', 'on_fire',
  'prone', 'grappled', 'poisoned', 'drugged', 'cyberpsychosis',
];

export function WoundTracker({ character, editable }: WoundTrackerProps) {
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const { damage, derivedStats, isStunned, conditions } = character;

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState(COMMON_CONDITIONS[0]);
  const [customName, setCustomName] = useState('');
  const [durationInput, setDurationInput] = useState('');

  const isCustom = selectedCondition === '__custom';

  const removeCondition = (name: string) => {
    updateCharacterField(
      character.id,
      'conditions',
      conditions.filter((c) => c.name !== name),
    );
  };

  const addCondition = () => {
    const name = (isCustom ? customName : selectedCondition).toLowerCase().trim().replace(/\s+/g, '_');
    if (!name) return;
    const dur = durationInput.trim() ? parseInt(durationInput, 10) : null;
    const duration = dur !== null && Number.isFinite(dur) && dur > 0 ? dur : null;
    const entry: CharacterCondition = { name, duration };

    const idx = conditions.findIndex((c) => c.name === name);
    let next: CharacterCondition[];
    if (idx !== -1) {
      next = [...conditions];
      next[idx] = entry;
    } else {
      next = [...conditions, entry];
    }
    updateCharacterField(character.id, 'conditions', next);
    setDurationInput('');
    setCustomName('');
    setShowAddForm(false);
  };

  const rollDuration = () => {
    const roll = Math.floor(Math.random() * 6) + 1;
    setDurationInput(String(roll));
  };
  const stunSaveMod = character.combatModifiers?.stunSave ?? 0;

  const woundStates: Array<{ name: string; range: [number, number]; penalty: string }> = [
    { name: 'Light', range: [1, 4], penalty: 'Stun 0' },
    { name: 'Serious', range: [5, 8], penalty: 'Stun -1' },
    { name: 'Critical', range: [9, 12], penalty: 'Stun -2' },
    { name: 'Mortal 0', range: [13, 16], penalty: 'Stun -3' },
    { name: 'Mortal 1', range: [17, 20], penalty: 'Stun -4' },
    { name: 'Mortal 2', range: [21, 24], penalty: 'Stun -5' },
    { name: 'Mortal 3', range: [25, 28], penalty: 'Stun -6' },
    { name: 'Mortal 4', range: [29, 32], penalty: 'Stun -7' },
    { name: 'Mortal 5', range: [33, 36], penalty: 'Stun -8' },
    { name: 'Mortal 6', range: [37, 40], penalty: 'Stun -9' },
  ];

  const handleDamageClick = (newDamage: number) => {
    if (!editable) return;
    // Toggle: if clicking current damage level, reduce; otherwise set
    const actualDamage = damage === newDamage ? newDamage - 1 : newDamage;
    updateCharacterField(character.id, 'damage', Math.max(0, Math.min(41, actualDamage)));
  };

  const toggleStunned = () => {
    if (!editable) return;
    updateCharacterField(character.id, 'isStunned', !isStunned);
  };

  return (
    <div className="border-2 border-black p-2 bg-white">
      <div className="flex flex-col gap-0.5">
        {woundStates.map((state, stateIndex) => {
          const [start, end] = state.range;
          const boxes = [];

          for (let i = start; i <= end; i++) {
            const isFilled = damage >= i;
            const isLeftBorder = i === start;
            const isRightBorder = i === end;

            boxes.push(
              <button
                key={i}
                onClick={() => handleDamageClick(i)}
                className={`w-4 h-4 border-black transition-colors ${
                  isFilled ? 'bg-red-600' : 'bg-white'
                } ${isLeftBorder ? 'border-l-2' : 'border-l'} ${
                  isRightBorder ? 'border-r-2' : 'border-r'
                } border-t border-b ${editable ? 'cursor-pointer hover:bg-red-300' : 'cursor-default'}`}
                title={`Damage: ${i}`}
                disabled={!editable}
              />,
            );
          }

          return (
            <div key={stateIndex} className="flex items-center gap-1">
              <span className="text-[10px] font-bold w-14 uppercase leading-none">
                {state.name}
              </span>
              <div className="flex">{boxes}</div>
              <span className="text-[9px] text-gray-500 ml-1">{state.penalty}</span>
            </div>
          );
        })}
      </div>

      {/* Current Status */}
      {derivedStats && (
        <div className="mt-2 pt-2 border-t border-black text-xs">
          <div className="flex justify-between items-center">
            <span
              className={`font-bold uppercase ${
                derivedStats.woundState === 'Dead' ? 'text-red-600' : ''
              }`}
            >
              {derivedStats.woundState === 'Dead'
                ? 'DEAD'
                : `Status: ${derivedStats.woundState}`}
            </span>
            <span>
              Damage: {damage}/{damage >= 41 ? 'DEAD' : '40'}
            </span>
          </div>

          {/* Stun indicator */}
          {damage > 0 && derivedStats.woundState !== 'Dead' && (
            <div className="flex items-center gap-2 mt-1">
              {editable ? (
                <button
                  onClick={toggleStunned}
                  className={`text-xs px-2 py-0.5 border font-bold uppercase ${
                    isStunned
                      ? 'border-orange-600 bg-orange-100 text-orange-600'
                      : 'border-gray-400 text-gray-400 hover:border-orange-600'
                  }`}
                >
                  {isStunned ? 'STUNNED' : 'Not Stunned'}
                </button>
              ) : (
                isStunned && (
                  <span className="text-xs font-bold text-orange-600 uppercase">STUNNED</span>
                )
              )}
              <span className="text-[10px] text-gray-500">
                Save target: ≤ {derivedStats.stunSaveTarget + stunSaveMod}
                {stunSaveMod !== 0 && (
                  <span className="text-gray-400">
                    {' '}
                    (base {derivedStats.stunSaveTarget}, mod {stunSaveMod >= 0 ? '+' : ''}
                    {stunSaveMod})
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Condition badges */}
          {conditions && conditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {conditions.map((cond) => (
                <span
                  key={cond.name}
                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 border rounded-sm inline-flex items-center gap-0.5 ${
                    CONDITION_COLORS[cond.name] ?? DEFAULT_BADGE
                  }`}
                >
                  {cond.name.replace(/_/g, ' ')}
                  {cond.duration != null && (
                    <span className="opacity-70">({cond.duration}r)</span>
                  )}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => removeCondition(cond.name)}
                      className="ml-0.5 leading-none opacity-60 hover:opacity-100"
                      title={`Remove ${cond.name}`}
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Add condition controls */}
          {editable && !showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="text-[10px] text-gray-400 hover:text-gray-600 mt-1 uppercase tracking-wide"
            >
              + Add condition
            </button>
          )}
          {editable && showAddForm && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                className="text-[10px] border border-gray-400 bg-white px-1 py-0.5 rounded-sm"
              >
                {COMMON_CONDITIONS.filter((c) => !conditions.some((ex) => ex.name === c)).map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
                <option value="__custom">Custom...</option>
              </select>
              {isCustom && (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="name"
                  className="text-[10px] border border-gray-400 px-1 py-0.5 w-16 rounded-sm"
                />
              )}
              <input
                type="number"
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                placeholder="rounds"
                min={1}
                className="text-[10px] border border-gray-400 px-1 py-0.5 w-12 rounded-sm"
              />
              <button
                type="button"
                onClick={rollDuration}
                className="text-[10px] px-1 py-0.5 border border-gray-400 bg-gray-50 hover:bg-gray-200 rounded-sm"
                title="Roll 1d6 for duration"
              >
                1d6
              </button>
              <button
                type="button"
                onClick={addCondition}
                className="text-[10px] px-1.5 py-0.5 bg-black text-white font-bold uppercase rounded-sm hover:bg-gray-800"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-[10px] text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Wound penalties display */}
          {(derivedStats.woundState === 'Serious' ||
            derivedStats.woundState === 'Critical' ||
            derivedStats.woundState.startsWith('Mortal')) && (
            <div className="text-[10px] text-red-600 mt-1">
              {derivedStats.woundState === 'Serious' && 'REF -2'}
              {derivedStats.woundState === 'Critical' && 'REF/INT/COOL halved'}
              {derivedStats.woundState.startsWith('Mortal') && 'REF/INT/COOL = 1/3'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
