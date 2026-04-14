'use client';

import { useState } from 'react';
import { Zone } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { TargetSelector } from './TargetSelector';
import { calculateDamage } from '@/lib/game-logic/formulas';

interface DamageApplicatorProps {
  characterId: string;
  onClose: () => void;
}

export function DamageApplicator({ characterId, onClose }: DamageApplicatorProps) {
  const [damageAmount, setDamageAmount] = useState<number>(0);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Zone | null>(null);
  const [isAP, setIsAP] = useState(false);

  const applyDamage = useGameStore((state) => state.applyDamage);
  const character = useGameStore((state) => state.characters.byId[characterId]);

  if (!character) return null;

  const btm = character.derivedStats?.btm || 0;

  const getSP = (location: Zone | null): number => {
    if (!location) return 0;
    const hitLoc = character.hitLocations[location];
    return Math.max(0, hitLoc.stoppingPower - hitLoc.ablation);
  };

  const getPreview = (location: Zone | null) => {
    const sp = getSP(location);
    return calculateDamage(damageAmount, location, sp, btm, isAP, false);
  };

  const handleApplyDamage = (location: Zone | null) => {
    if (damageAmount > 0) {
      applyDamage(characterId, damageAmount, location, isAP);
      onClose();
    }
  };

  const preview = getPreview(selectedLocation);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white border-4 border-black p-6 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold uppercase">Apply Damage</h2>
            <button onClick={onClose} className="text-3xl font-bold hover:text-red-600">
              ×
            </button>
          </div>

          {/* Character Info */}
          <div className="border-2 border-black p-3 mb-4 bg-gray-50">
            <div className="font-bold text-lg">{character.name}</div>
            <div className="text-sm text-gray-600 flex gap-4">
              <span>Damage: {character.damage}/40</span>
              <span>BTM: {btm}</span>
              <span>State: {character.derivedStats?.woundState || 'Uninjured'}</span>
            </div>
          </div>

          {/* Damage Input */}
          <div className="mb-4">
            <label className="block font-bold uppercase text-sm mb-2">Base Damage (after dice)</label>
            <input
              type="number"
              value={damageAmount}
              onChange={(e) => setDamageAmount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full border-2 border-black px-3 py-2 text-2xl font-bold text-center"
              min="0"
              autoFocus
            />
          </div>

          {/* AP Toggle */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAP}
                onChange={(e) => setIsAP(e.target.checked)}
                className="w-5 h-5 accent-red-600"
              />
              <span className="font-bold uppercase text-sm">
                Armor Piercing (AP) — halves SP
              </span>
            </label>
          </div>

          {/* Location Selection */}
          {selectedLocation && (
            <div className="mb-4 p-2 border-2 border-blue-600 bg-blue-50 flex justify-between items-center">
              <span className="font-bold">
                Location: {selectedLocation}
                {' '}(SP: {getSP(selectedLocation)}{isAP ? ` → ${Math.floor(getSP(selectedLocation) / 2)} AP` : ''})
              </span>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-blue-600 font-bold hover:text-red-600"
              >
                Clear
              </button>
            </div>
          )}

          {/* Damage Calculation Preview */}
          {damageAmount > 0 && (
            <div className="mb-4 p-3 bg-gray-100 border-2 border-gray-400">
              <div className="text-sm font-bold mb-2 uppercase">Damage Pipeline:</div>
              <div className="text-xs space-y-1 font-mono">
                <div>Base Damage: {damageAmount}</div>
                {preview.headMultiplied && (
                  <div className="text-red-600 font-bold">× 2 (Head Hit) = {damageAmount * 2}</div>
                )}
                {selectedLocation && (
                  <div>
                    − SP {getSP(selectedLocation)}
                    {isAP && ` (halved to ${preview.effectiveSP})`}
                    {' '}= −{preview.spReduction}
                  </div>
                )}
                <div>− BTM {btm} = −{preview.btmReduction}</div>
                <div className="border-t border-gray-400 pt-1 mt-1 font-bold text-lg">
                  Final Damage: {preview.finalDamage}
                </div>
                <div className="text-gray-600">
                  New Total: {character.damage} + {preview.finalDamage} ={' '}
                  {Math.min(41, character.damage + preview.finalDamage)}
                </div>
              </div>
            </div>
          )}

          {/* Quick Damage Buttons */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[1, 3, 5, 10, 15].map((amount) => (
              <button
                key={amount}
                onClick={() => setDamageAmount(amount)}
                className={`border-2 p-2 font-bold ${
                  damageAmount === amount ? 'border-red-600 bg-red-50' : 'border-black hover:bg-gray-100'
                }`}
              >
                {amount}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={() => setShowTargetSelector(true)}
              disabled={damageAmount === 0}
              className="w-full bg-red-500 hover:bg-red-600 text-white border-2 border-black p-3 font-bold uppercase disabled:bg-gray-300 disabled:text-gray-500"
            >
              Select Location & Apply
            </button>

            <button
              onClick={() => {
                setSelectedLocation(null);
                handleApplyDamage(null);
              }}
              disabled={damageAmount === 0}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white border-2 border-black p-3 font-bold uppercase disabled:bg-gray-300 disabled:text-gray-500"
            >
              Apply General (No SP)
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <p><strong>Pipeline:</strong> Base → Head ×2 → −SP → −BTM → Final</p>
            <p><strong>AP Ammo:</strong> Halves the location's SP before subtraction</p>
            <p><strong>General:</strong> Bypasses SP (no armor at that location)</p>
          </div>
        </div>
      </div>

      {showTargetSelector && (
        <TargetSelector
          onSelect={(location) => {
            setSelectedLocation(location);
            setShowTargetSelector(false);
            handleApplyDamage(location);
          }}
          onCancel={() => setShowTargetSelector(false)}
        />
      )}
    </>
  );
}
