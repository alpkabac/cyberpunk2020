'use client';

import React from 'react';
import { Character } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';

interface WoundTrackerProps {
  character: Character;
  editable: boolean;
}

export function WoundTracker({ character, editable }: WoundTrackerProps) {
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const { damage, derivedStats, isStunned } = character;

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
                Save target: ≤ {derivedStats.stunSaveTarget}
              </span>
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
