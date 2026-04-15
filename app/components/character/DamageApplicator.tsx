'use client';

import { useState } from 'react';
import { Zone } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { TargetSelector } from './TargetSelector';
import { calculateDamage } from '@/lib/game-logic/formulas';
import { maxDamageFromDiceFormula } from '@/lib/game-logic/dice';

/** Optional pre-fill when opening from Combat (e.g. point blank + weapon damage code). */
export interface DamageApplicatorPreset {
  pointBlank?: boolean;
  weaponDamageFormula?: string;
  /** Pre-fill base damage when not using point-blank max from formula */
  damageAmount?: number;
}

function initialDamageAmount(preset: DamageApplicatorPreset | null | undefined): number {
  if (!preset) return 0;
  if (preset.pointBlank && preset.weaponDamageFormula?.trim()) {
    const m = maxDamageFromDiceFormula(preset.weaponDamageFormula.trim());
    if (m !== null) return m;
  }
  return preset.damageAmount ?? 0;
}

interface DamageApplicatorProps {
  characterId: string;
  onClose: () => void;
  preset?: DamageApplicatorPreset | null;
}

export function DamageApplicator({
  characterId,
  onClose,
  preset = null,
}: DamageApplicatorProps) {
  const [damageAmount, setDamageAmount] = useState<number>(() => initialDamageAmount(preset));
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Zone | null>(null);
  const [isAP, setIsAP] = useState(false);
  const [pointBlank, setPointBlank] = useState(() => preset?.pointBlank ?? false);
  const [weaponDamageFormula, setWeaponDamageFormula] = useState(
    () => preset?.weaponDamageFormula ?? '',
  );

  const applyDamage = useGameStore((state) => state.applyDamage);
  const character = useGameStore((state) => state.characters.byId[characterId]);

  if (!character) return null;

  const btm = character.derivedStats?.btm || 0;

  const getSP = (location: Zone | null): number => {
    if (!location) return 0;
    const hitLoc = character.hitLocations[location];
    return Math.max(0, hitLoc.stoppingPower - hitLoc.ablation);
  };

  const effectiveBaseDamage = (): number => {
    if (pointBlank && weaponDamageFormula.trim()) {
      const maxD = maxDamageFromDiceFormula(weaponDamageFormula);
      if (maxD !== null) return maxD;
    }
    return damageAmount;
  };

  const getPreview = (location: Zone | null) => {
    const sp = getSP(location);
    return calculateDamage(effectiveBaseDamage(), location, sp, btm, isAP);
  };

  const handleApplyDamage = (location: Zone | null) => {
    const base = effectiveBaseDamage();
    if (base > 0) {
      applyDamage(
        characterId,
        base,
        location,
        isAP,
        pointBlank,
        weaponDamageFormula.trim() || null,
      );
      onClose();
    }
  };

  const preview = getPreview(selectedLocation);
  const pbMax =
    pointBlank && weaponDamageFormula.trim()
      ? maxDamageFromDiceFormula(weaponDamageFormula.trim())
      : null;

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

          {preset?.pointBlank && (
            <p className="text-xs font-bold uppercase border-2 border-amber-600 bg-amber-50 text-amber-900 px-2 py-1.5 mb-3">
              Pre-filled from Combat: point blank + weapon damage code (FNFF max dice).
            </p>
          )}
          {preset && !preset.pointBlank && preset.weaponDamageFormula && (
            <p className="text-xs font-bold uppercase border-2 border-gray-400 bg-gray-50 px-2 py-1.5 mb-3">
              Pre-filled: weapon damage code — set base damage or use point blank if at muzzle range.
            </p>
          )}

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
              title="Rolled weapon damage, or enter max manually if using point blank without a formula"
            />
          </div>

          <div className="mb-4 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pointBlank}
                onChange={(e) => setPointBlank(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-amber-600"
              />
              <span className="text-sm font-bold uppercase">
                Point blank — max weapon damage (FNFF)
              </span>
            </label>
            <p className="text-xs text-gray-600 pl-7">
              At point blank range, damage is maximum for the weapon. Enter the weapon code below (e.g.{' '}
              <code className="bg-gray-100 px-1">3d6</code>, <code className="bg-gray-100 px-1">4d6+1</code>
              ) or leave blank and set base damage to the max yourself.
            </p>
            {pointBlank && (
              <input
                type="text"
                value={weaponDamageFormula}
                onChange={(e) => setWeaponDamageFormula(e.target.value)}
                placeholder="e.g. 4d6+1"
                className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                title="Weapon damage dice formula — max value is used when point blank is checked"
              />
            )}
            {pointBlank && pbMax !== null && (
              <p className="text-xs font-bold text-amber-800 pl-7">
                Using max from formula: <strong>{pbMax}</strong> (overrides the number field for the pipeline)
              </p>
            )}
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
          {effectiveBaseDamage() > 0 && (
            <div className="mb-4 p-3 bg-gray-100 border-2 border-gray-400">
              <div className="text-sm font-bold mb-2 uppercase">Damage Pipeline:</div>
              <div className="text-xs space-y-1 font-mono">
                <div>
                  Base Damage: {effectiveBaseDamage()}
                  {pointBlank && pbMax !== null && (
                    <span className="text-amber-700"> (point blank max)</span>
                  )}
                </div>
                {preview.headMultiplied && (
                  <div className="text-red-600 font-bold">
                    × 2 (Head Hit) = {effectiveBaseDamage() * 2}
                  </div>
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
              disabled={effectiveBaseDamage() === 0}
              className="w-full bg-red-500 hover:bg-red-600 text-white border-2 border-black p-3 font-bold uppercase disabled:bg-gray-300 disabled:text-gray-500"
            >
              Select Location & Apply
            </button>

            <button
              onClick={() => {
                setSelectedLocation(null);
                handleApplyDamage(null);
              }}
              disabled={effectiveBaseDamage() === 0}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white border-2 border-black p-3 font-bold uppercase disabled:bg-gray-300 disabled:text-gray-500"
            >
              Apply General (No SP)
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <p><strong>Pipeline:</strong> Base → Head ×2 → −SP → −BTM → Final</p>
            <p><strong>Point blank:</strong> Base = max dice total for the weapon code (CP2020 FNFF).</p>
            <p><strong>AP Ammo:</strong> Halves the SP at that location before subtraction</p>
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
