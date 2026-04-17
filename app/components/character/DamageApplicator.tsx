'use client';

import { useState } from 'react';
import { Zone } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { TargetSelector } from './TargetSelector';
import { calculateDamage } from '@/lib/game-logic/formulas';
import { maxDamageFromDiceFormula, rollDice } from '@/lib/game-logic/dice';
import {
  rollFnffHitLocation,
  hitLocationRollRanges,
  defaultTargetLocations,
} from '@/lib/game-logic/lookups';

/** How hit location is chosen before applying damage (FNFF). */
export type HitLocationMode = 'random' | 'aimed' | 'manual';

/**
 * Optional pre-fill when opening from Combat.
 * AI/GM tools do not use this — they call apply_damage with explicit location and raw_damage.
 */
export interface DamageApplicatorPreset {
  pointBlank?: boolean;
  weaponDamageFormula?: string;
  damageAmount?: number;
  /** Player took aimed shot and declared this zone (optional if they pick in-modal). */
  aimedLocation?: Zone;
  hitLocationMode?: HitLocationMode;
}

function initialDamageAmount(preset: DamageApplicatorPreset | null | undefined): number {
  if (!preset) return 0;
  if (preset.pointBlank && preset.weaponDamageFormula?.trim()) {
    const m = maxDamageFromDiceFormula(preset.weaponDamageFormula.trim());
    if (m !== null) return m;
  }
  return preset.damageAmount ?? 0;
}

const ZONE_LABELS: Record<Zone, string> = {
  Head: 'Head',
  Torso: 'Torso',
  rArm: 'Right Arm',
  lArm: 'Left Arm',
  rLeg: 'Right Leg',
  lLeg: 'Left Leg',
};

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
  const [selectedLocation, setSelectedLocation] = useState<Zone | null>(
    () => preset?.aimedLocation ?? null,
  );
  const [isAP, setIsAP] = useState(false);
  const [pointBlank, setPointBlank] = useState(() => preset?.pointBlank ?? false);
  const [weaponDamageFormula, setWeaponDamageFormula] = useState(
    () => preset?.weaponDamageFormula ?? '',
  );
  const [hitLocationMode, setHitLocationMode] = useState<HitLocationMode>(() => {
    if (preset?.aimedLocation) return 'aimed';
    if (preset?.hitLocationMode) return preset.hitLocationMode;
    return 'random';
  });
  const [lastHitLocD10, setLastHitLocD10] = useState<number | null>(null);

  const pbMaxForSync =
    pointBlank && weaponDamageFormula.trim()
      ? maxDamageFromDiceFormula(weaponDamageFormula.trim())
      : null;

  const [prevPbMax, setPrevPbMax] = useState(pbMaxForSync);
  if (pbMaxForSync !== prevPbMax) {
    setPrevPbMax(pbMaxForSync);
    if (pbMaxForSync !== null) {
      setDamageAmount(pbMaxForSync);
    }
  }

  const applyDamage = useGameStore((state) => state.applyDamage);
  const character = useGameStore(
    (state) => state.characters.byId[characterId] ?? state.npcs.byId[characterId],
  );

  if (!character) return null;

  const btm = character.derivedStats?.btm || 0;

  const getSP = (location: Zone | null): number => {
    if (!location) return 0;
    const hitLoc = character.hitLocations[location];
    return Math.max(0, hitLoc.stoppingPower - hitLoc.ablation);
  };

  const effectiveBaseDamage = (): number => {
    if (pointBlank && weaponDamageFormula.trim()) {
      const maxD = maxDamageFromDiceFormula(weaponDamageFormula.trim());
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
  const pbMax = pbMaxForSync;

  const canRollWeaponDamage =
    !pointBlank &&
    weaponDamageFormula.trim().length > 0 &&
    maxDamageFromDiceFormula(weaponDamageFormula.trim()) !== null;

  const handleRollWeaponDamage = () => {
    const f = weaponDamageFormula.trim();
    if (!f || pointBlank) return;
    const r = rollDice(f);
    if (r) setDamageAmount(Math.max(0, r.total));
  };

  const handleRollHitLocation = () => {
    const { d10, zone } = rollFnffHitLocation();
    setLastHitLocD10(d10);
    if (zone) setSelectedLocation(zone);
  };

  const handleHitLocationModeChange = (mode: HitLocationMode) => {
    setHitLocationMode(mode);
    setLastHitLocD10(null);
    if (mode === 'aimed') {
      setSelectedLocation(preset?.aimedLocation ?? null);
    } else {
      setSelectedLocation(null);
    }
  };

  const baseOk = effectiveBaseDamage() > 0;
  const applyArmorDisabled = !baseOk || selectedLocation === null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white border-4 border-black p-6 max-w-md w-full max-h-[95vh] overflow-y-auto">
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
              Pre-filled weapon code — roll damage here or use point blank at muzzle range.
            </p>
          )}

          <div className="border-2 border-black p-3 mb-4 bg-gray-50">
            <div className="font-bold text-lg">{character.name}</div>
            <div className="text-sm text-gray-600 flex flex-wrap gap-4">
              <span>Damage: {character.damage}/40</span>
              <span>BTM: {btm}</span>
              <span>State: {character.derivedStats?.woundState || 'Uninjured'}</span>
            </div>
          </div>

          {/* Hit location (FNFF) — client UI; AI GM passes location via apply_damage */}
          <div className="mb-4 border-2 border-black p-3 bg-slate-50">
            <div className="text-xs font-bold uppercase mb-2">Hit location</div>
            <p className="text-[10px] text-gray-600 mb-2">
              Random = standard <strong>d10</strong> table (no modifiers). Aimed = you already took the
              attack penalty — pick the zone. Manual = choose from the list. Multiplayer: same rules;
              host/GMs may resolve elsewhere — this only sets location for the pipeline below.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(['random', 'aimed', 'manual'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleHitLocationModeChange(mode)}
                  className={`text-[10px] font-bold uppercase px-2 py-1 border-2 ${
                    hitLocationMode === mode
                      ? 'border-amber-800 bg-amber-100'
                      : 'border-gray-400 bg-white hover:bg-gray-100'
                  }`}
                >
                  {mode === 'random' ? 'Random (d10)' : mode === 'aimed' ? 'Aimed zone' : 'Manual pick'}
                </button>
              ))}
            </div>
            {hitLocationMode === 'random' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleRollHitLocation}
                  className="w-full border-2 border-black bg-white py-2 text-xs font-bold uppercase hover:bg-gray-100"
                >
                  Roll d10 (hit location)
                </button>
                {lastHitLocD10 !== null && selectedLocation && (
                  <p className="text-xs font-mono">
                    d10: <strong>{lastHitLocD10}</strong> →{' '}
                    <strong className="text-amber-900">{ZONE_LABELS[selectedLocation]}</strong> (
                    {hitLocationRollRanges[selectedLocation]})
                  </p>
                )}
              </div>
            )}
            {hitLocationMode === 'aimed' && (
              <div>
                <label className="block text-[10px] font-bold uppercase mb-1">Declared hit zone</label>
                <select
                  value={selectedLocation ?? ''}
                  onChange={(e) => {
                    const v = e.target.value as Zone | '';
                    setSelectedLocation(v ? (v as Zone) : null);
                  }}
                  className="w-full border-2 border-black px-2 py-2 text-sm font-bold"
                >
                  <option value="">— Select —</option>
                  {defaultTargetLocations.map((z) => (
                    <option key={z} value={z}>
                      {ZONE_LABELS[z]} (d10 {hitLocationRollRanges[z]})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {hitLocationMode === 'manual' && (
              <button
                type="button"
                onClick={() => setShowTargetSelector(true)}
                className="w-full border-2 border-blue-700 bg-blue-50 py-2 text-xs font-bold uppercase hover:bg-blue-100"
              >
                {selectedLocation ? `Change location (${ZONE_LABELS[selectedLocation]})` : 'Choose hit location…'}
              </button>
            )}
          </div>

          <div className="mb-4">
            <label className="block font-bold uppercase text-sm mb-2">Weapon / damage dice (optional)</label>
            <input
              type="text"
              value={weaponDamageFormula}
              onChange={(e) => setWeaponDamageFormula(e.target.value)}
              placeholder="e.g. 3d6, 4d6+1"
              className="w-full border-2 border-black px-3 py-2 font-mono text-sm mb-2"
            />
            <label className="block font-bold uppercase text-sm mb-2">Base damage (after dice)</label>
            <input
              type="number"
              value={damageAmount}
              readOnly={pointBlank && pbMax !== null}
              onChange={(e) => setDamageAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className={`w-full border-2 border-black px-3 py-2 text-2xl font-bold text-center ${
                pointBlank && pbMax !== null ? 'bg-amber-50/80 cursor-not-allowed' : ''
              }`}
              min={0}
              title={
                pointBlank && pbMax !== null
                  ? 'Point blank: value matches max dice for the code above'
                  : 'Set manually, or use Roll weapon damage (when not point blank)'
              }
            />
            {!pointBlank && (
              <button
                type="button"
                onClick={handleRollWeaponDamage}
                disabled={!canRollWeaponDamage}
                className="w-full border-2 border-red-800 bg-red-100 px-3 py-2 text-xs font-bold uppercase hover:bg-red-200 disabled:bg-gray-200 disabled:text-gray-500"
                title="Roll the weapon code once; fills base damage (same RNG as Combat Roll Damage)"
              >
                Roll weapon damage
              </button>
            )}
            <div className="grid grid-cols-5 gap-2 mt-2">
              {[1, 3, 5, 10, 15].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  disabled={pointBlank && pbMax !== null}
                  onClick={() => setDamageAmount(amount)}
                  className={`border-2 p-2 font-bold text-sm ${
                    damageAmount === amount ? 'border-red-600 bg-red-50' : 'border-black hover:bg-gray-100'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {amount}
                </button>
              ))}
            </div>
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
              Uses maximum for the dice code above. Uncheck to use rolled or typed base damage.
            </p>
            {pointBlank && pbMax !== null && (
              <p className="text-xs font-bold text-amber-800 pl-7">
                Base damage field shows max from formula: <strong>{pbMax}</strong>
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAP}
                onChange={(e) => setIsAP(e.target.checked)}
                className="w-5 h-5 accent-red-600"
              />
              <span className="font-bold uppercase text-sm">Armor Piercing (AP) — halves SP</span>
            </label>
          </div>

          {selectedLocation && (
            <div className="mb-4 p-2 border-2 border-blue-600 bg-blue-50 flex justify-between items-center">
              <span className="font-bold text-sm">
                Location: {ZONE_LABELS[selectedLocation]} (SP: {getSP(selectedLocation)}
                {isAP ? ` → ${Math.floor(getSP(selectedLocation) / 2)} AP` : ''})
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedLocation(null);
                  setLastHitLocD10(null);
                }}
                className="text-blue-600 font-bold hover:text-red-600 text-sm"
              >
                Clear
              </button>
            </div>
          )}

          {baseOk && (
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
                    {isAP && ` (halved to ${preview.effectiveSP})`}= −{preview.spReduction}
                    {preview.penetrated ? (
                      <span className="text-red-700"> (penetrated → armor ablates 1)</span>
                    ) : (
                      <span className="text-green-700"> (stopped — no ablation)</span>
                    )}
                  </div>
                )}
                <div>
                  − BTM {btm} = −{preview.btmReduction}
                  {preview.btmClampedToOne && (
                    <span className="text-amber-700"> (BTM min 1 applied)</span>
                  )}
                </div>
                <div className="border-t border-gray-400 pt-1 mt-1 font-bold text-lg">
                  Final Damage: {preview.finalDamage}
                </div>
                {preview.headAutoKill && (
                  <div className="font-bold text-red-700">
                    HEAD hit &gt; 8 damage — FNFF: automatic death (damage → 41).
                  </div>
                )}
                {preview.limbSevered && !preview.headAutoKill && (
                  <div className="font-bold text-red-700">
                    LIMB hit &gt; 8 damage — FNFF: severed, forced Mortal 0 death save.
                  </div>
                )}
                <div className="text-gray-600">
                  New Total: {character.damage} + {preview.finalDamage} ={' '}
                  {preview.headAutoKill
                    ? 41
                    : preview.limbSevered
                      ? Math.min(41, Math.max(character.damage + preview.finalDamage, 13))
                      : Math.min(41, character.damage + preview.finalDamage)}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleApplyDamage(selectedLocation)}
              disabled={applyArmorDisabled}
              title={
                !baseOk
                  ? 'Set base damage first'
                  : !selectedLocation
                    ? 'Set hit location (roll, aimed, or manual)'
                    : undefined
              }
              className="w-full bg-red-500 hover:bg-red-600 text-white border-2 border-black p-3 font-bold uppercase disabled:bg-gray-300 disabled:text-gray-500"
            >
              Apply damage (armor / location)
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedLocation(null);
                handleApplyDamage(null);
              }}
              disabled={!baseOk}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white border-2 border-black p-3 font-bold uppercase disabled:bg-gray-300 disabled:text-gray-500"
            >
              Apply general (no SP)
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <p>
              <strong>AI / multiplayer:</strong> Remote players and the AI GM apply damage through the same
              character row; GM tools use explicit <code className="bg-gray-100 px-1">location</code> and{' '}
              <code className="bg-gray-100 px-1">raw_damage</code> (no d10 in the API).
            </p>
            <p>
              <strong>Pipeline:</strong> Base → Head ×2 → −SP → −BTM (min 1 if armor pierced) → Final.
              Armor ablates 1 only on a penetrating hit. Any damage auto-prompts a Stun Save.
            </p>
          </div>
        </div>
      </div>

      {showTargetSelector && (
        <TargetSelector
          onSelect={(location) => {
            setSelectedLocation(location);
            setShowTargetSelector(false);
          }}
          onCancel={() => setShowTargetSelector(false)}
        />
      )}
    </>
  );
}
