'use client';

import React from 'react';
import { Character, StatBlock, Stats } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';

function safeStatTotal(stat: StatBlock): number {
  if (typeof stat.total === 'number' && Number.isFinite(stat.total)) {
    return stat.total;
  }
  const b = Number(stat.base ?? 0);
  const tm = Number(stat.tempMod ?? 0);
  const c = Number(stat.cyberMod ?? 0);
  const a = Number(stat.armorMod ?? 0);
  const w = Number(stat.woundMod ?? 0);
  const sum = b + tm + c + a + w;
  return Number.isFinite(sum) ? Math.max(0, sum) : 0;
}

interface StatsRowProps {
  character: Character;
  editable: boolean;
}

export function StatsRow({ character, editable }: StatsRowProps) {
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const openDiceRoller = useGameStore((state) => state.openDiceRoller);

  const { stats, derivedStats } = character;

  const statLabels: Record<keyof Stats, string> = {
    int: 'INT',
    ref: 'REF',
    tech: 'TECH',
    cool: 'COOL',
    attr: 'ATTR',
    luck: 'LUCK',
    ma: 'MA',
    bt: 'BT',
    emp: 'EMP',
  };

  const handleStatChange = (statKey: keyof Stats, field: 'base' | 'tempMod', value: number) => {
    if (!editable) return;
    updateCharacterField(character.id, `stats.${statKey}.${field}`, value);
  };

  const handleStatRoll = (statKey: keyof Stats) => {
    const total = safeStatTotal(stats[statKey]);
    openDiceRoller(`1d10+${total}`);
  };

  // Check if a stat has modifiers (cyber, armor, wound)
  const hasModifiers = (statKey: keyof Stats): boolean => {
    const s = stats[statKey];
    return (
      Number(s.cyberMod ?? 0) !== 0 ||
      Number(s.armorMod ?? 0) !== 0 ||
      Number(s.woundMod ?? 0) !== 0
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Main Stats Row */}
      <div className="grid grid-cols-9 gap-1">
        {(Object.keys(stats) as Array<keyof Stats>).map((statKey) => {
          const stat = stats[statKey];
          const total = safeStatTotal(stat);
          const hasMods = hasModifiers(statKey);

          return (
            <div
              key={statKey}
              className={`flex flex-col items-center border-2 p-1 bg-white ${
                hasMods ? 'border-blue-600' : 'border-black'
              }`}
            >
              <label className="text-xs font-bold uppercase">{statLabels[statKey]}</label>

              {/* Base + Temp Mod */}
              <div className="flex items-center gap-0.5 text-xs">
                {editable ? (
                  <>
                    <input
                      type="number"
                      value={Number.isFinite(Number(stat.base)) ? stat.base : ''}
                      onChange={(e) =>
                        handleStatChange(statKey, 'base', parseInt(e.target.value) || 1)
                      }
                      className="w-8 text-center border border-gray-400 p-0.5"
                      min="1"
                      max="15"
                    />
                    <span>+</span>
                    <input
                      type="number"
                      value={Number.isFinite(Number(stat.tempMod)) ? stat.tempMod : ''}
                      onChange={(e) =>
                        handleStatChange(statKey, 'tempMod', parseInt(e.target.value) || 0)
                      }
                      className="w-8 text-center border border-gray-400 p-0.5"
                      min="-10"
                      max="10"
                    />
                  </>
                ) : (
                  <span>
                    {stat.base ?? '—'}
                    {Number(stat.tempMod ?? 0) !== 0 && (
                      <span className="text-gray-500">
                        {Number(stat.tempMod) > 0 ? `+${stat.tempMod}` : stat.tempMod}
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Modifier indicators */}
              {hasMods && (
                <div className="text-[9px] text-blue-600 leading-tight">
                  {stat.cyberMod !== 0 && <span>cy:{stat.cyberMod > 0 ? '+' : ''}{stat.cyberMod} </span>}
                  {stat.armorMod !== 0 && <span>ev:{stat.armorMod} </span>}
                  {stat.woundMod !== 0 && <span>wd:{stat.woundMod} </span>}
                </div>
              )}

              {/* Total (clickable for roll) */}
              <button
                onClick={() => handleStatRoll(statKey)}
                className={`w-full mt-1 py-1 border border-black font-bold cursor-pointer ${
                  total <= 0
                    ? 'bg-red-200 hover:bg-red-300'
                    : hasMods
                      ? 'bg-blue-100 hover:bg-blue-200'
                      : 'bg-gray-200 hover:bg-gray-300'
                }`}
                title={`Roll ${statLabels[statKey]}: 1d10+${total}`}
              >
                {total}
              </button>
            </div>
          );
        })}
      </div>

      {/* Derived Stats Row */}
      {derivedStats && (
        <div className="grid grid-cols-8 gap-1 text-xs">
          <div className="flex flex-col items-center border border-black p-1 bg-white" title="Body Type Modifier">
            <label className="font-bold uppercase">BTM</label>
            <span className="font-bold">{derivedStats.btm}</span>
          </div>
          <div className="flex flex-col items-center border border-black p-1 bg-white" title="Strength Damage Bonus (melee)">
            <label className="font-bold uppercase">SDB</label>
            <span className="font-bold">
              {derivedStats.strengthDamageBonus >= 0 ? '+' : ''}
              {derivedStats.strengthDamageBonus}
            </span>
          </div>
          <div className="flex flex-col items-center border border-black p-1 bg-white">
            <label className="font-bold uppercase">Run</label>
            <span>{derivedStats.run}m</span>
          </div>
          <div className="flex flex-col items-center border border-black p-1 bg-white">
            <label className="font-bold uppercase">Leap</label>
            <span>{derivedStats.leap}m</span>
          </div>
          <div className="flex flex-col items-center border border-black p-1 bg-white">
            <label className="font-bold uppercase">Carry</label>
            <span>{derivedStats.carry}kg</span>
          </div>
          <div className="flex flex-col items-center border border-black p-1 bg-white">
            <label className="font-bold uppercase">Lift</label>
            <span>{derivedStats.lift}kg</span>
          </div>
          <div className="flex flex-col items-center border border-black p-1 bg-white" title="Humanity / Max Humanity">
            <label className="font-bold uppercase">HUM</label>
            <span>
              {derivedStats.humanity}/
              {(Number(stats.emp.base ?? 0) + Number(stats.emp.tempMod ?? 0) + Number(stats.emp.cyberMod ?? 0)) * 10}
            </span>
          </div>
          <div className="flex flex-col items-center border border-black p-1 bg-white" title="Save Number (= BT)">
            <label className="font-bold uppercase">Save</label>
            <span className="font-bold">{derivedStats.saveNumber}</span>
          </div>
        </div>
      )}
    </div>
  );
}
