'use client';

import { useState } from 'react';
import { Character, Zone, Weapon, Armor, FireMode } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { DamageApplicator, type DamageApplicatorPreset } from '../DamageApplicator';
import { ItemBrowser } from '../ItemBrowser';
import { maxLayeredSP, getStabilizationMedicBonus } from '@/lib/game-logic/formulas';
import {
  rangeBrackets,
  getRangeDistance,
  reliabilityLabels,
  concealabilityLabels,
  hitLocationRollRanges,
  rangedCombatModifiers,
  RangeBracket,
} from '@/lib/game-logic/lookups';

/** Must match `rangedCombatModifiers` key for aimed shots (attack −4; zone chosen if hit). */
const AIMED_SHOT_LABEL = 'Aimed shot (specific area)' as const;

interface CombatTabProps {
  character: Character;
  editable: boolean;
}

export function CombatTab({ character, editable }: CombatTabProps) {
  const [showDamageApplicator, setShowDamageApplicator] = useState(false);
  const [damageApplicatorPreset, setDamageApplicatorPreset] =
    useState<DamageApplicatorPreset | null>(null);
  const [showItemBrowser, setShowItemBrowser] = useState(false);
  const [expandedWeaponId, setExpandedWeaponId] = useState<string | null>(null);
  /** Per-weapon checklist for FNFF ranged situational modifiers (lookups). */
  const [rangedModToggles, setRangedModToggles] = useState<Record<string, Record<string, boolean>>>(
    {},
  );
  /** Last selected range bracket per weapon (for DC highlight + preview). */
  const [selectedRangeByWeapon, setSelectedRangeByWeapon] = useState<
    Record<string, RangeBracket>
  >({});
  /** Patient total damage — medic may override when stabilizing someone else. */
  const [stabilizationTarget, setStabilizationTarget] = useState(() =>
    Math.max(1, Math.min(40, character.damage)),
  );
  /** When aimed shot is checked, optional declared zone for Apply Damage preset. */
  const [aimedZoneByWeapon, setAimedZoneByWeapon] = useState<Record<string, string>>({});

  const openDiceRoller = useGameStore((state) => state.openDiceRoller);
  const beginStunSaveRoll = useGameStore((state) => state.beginStunSaveRoll);
  const beginDeathSaveRoll = useGameStore((state) => state.beginDeathSaveRoll);
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const fireWeapon = useGameStore((state) => state.fireWeapon);
  const reloadWeapon = useGameStore((state) => state.reloadWeapon);
  const sellItem = useGameStore((state) => state.sellItem);

  const toggleItemEquipped = (itemId: string) => {
    const updatedItems = character.items.map((i) =>
      i.id === itemId ? { ...i, equipped: !i.equipped } : i,
    );
    updateCharacterField(character.id, 'items', updatedItems);
  };

  const initMod = character.combatModifiers?.initiative ?? 0;
  const stunSaveMod = character.combatModifiers?.stunSave ?? 0;
  const stabBonus = getStabilizationMedicBonus(character);
  const medSkillForStab = Math.max(0, stabBonus - (character.stats.tech.total ?? 0));

  const setCombatModifier = (key: 'initiative' | 'stunSave', value: number) => {
    const next = {
      initiative: character.combatModifiers?.initiative ?? 0,
      stunSave: character.combatModifiers?.stunSave ?? 0,
      [key]: value,
    };
    updateCharacterField(character.id, 'combatModifiers', next);
  };

  const locationOrder: Zone[] = ['Head', 'Torso', 'rArm', 'lArm', 'rLeg', 'lLeg'];
  const locationLabels: Record<Zone, string> = {
    Head: 'Head',
    Torso: 'Torso',
    rArm: 'Right Arm',
    lArm: 'Left Arm',
    rLeg: 'Right Leg',
    lLeg: 'Left Leg',
  };

  const weapons = character.items.filter((i): i is Weapon => i.type === 'weapon');
  const armorItems = character.items.filter((i): i is Armor => i.type === 'armor');
  const sdb = character.derivedStats?.strengthDamageBonus ?? 0;

  // Armor encumbrance: direct sum (not halved)
  const totalEncumbrance = armorItems
    .filter((a) => a.equipped)
    .reduce((sum, a) => sum + (a.encumbrance || 0), 0);

  // Calculate layered SP per location from equipped armor
  const calculateLayeredSP = (location: Zone): number => {
    const spValues: number[] = [];
    armorItems
      .filter((a) => a.equipped)
      .forEach((armor) => {
        const cov = armor.coverage?.[location];
        if (cov) {
          const sp = cov.stoppingPower || 0;
          if (sp > 0) spValues.push(sp);
        }
      });
    if (spValues.length === 0) return 0;
    if (spValues.length === 1) return spValues[0];
    return maxLayeredSP(spValues);
  };

  // Find attack skill value for a weapon
  const getAttackSkillTotal = (weapon: Weapon): number => {
    const skill = character.skills.find(
      (s) => s.name.toLowerCase() === weapon.attackSkill?.toLowerCase(),
    );
    const skillVal = skill?.value || 0;
    const refTotal = character.stats.ref.total || 0;
    return refTotal + skillVal + (weapon.accuracy || 0);
  };

  const getRangedModSum = (weaponId: string): number => {
    const toggles = rangedModToggles[weaponId];
    if (!toggles) return 0;
    let sum = 0;
    for (const [label, value] of Object.entries(rangedCombatModifiers)) {
      if (toggles[label]) sum += value;
    }
    return sum;
  };

  const toggleRangedMod = (weaponId: string, label: string) => {
    setRangedModToggles((prev) => ({
      ...prev,
      [weaponId]: {
        ...(prev[weaponId] || {}),
        [label]: !prev[weaponId]?.[label],
      },
    }));
  };

  const clearRangedMods = (weaponId: string) => {
    setRangedModToggles((prev) => ({ ...prev, [weaponId]: {} }));
  };

  // Roll attack: REF+skill+WA + ranged checklist (ranged only)
  const handleAttackRoll = (weapon: Weapon, bracket: RangeBracket) => {
    const base = getAttackSkillTotal(weapon);
    const modSum = weapon.weaponType === 'Melee' ? 0 : getRangedModSum(weapon.id);
    setSelectedRangeByWeapon((prev) => ({ ...prev, [weapon.id]: bracket }));
    const isAutoWeapon = weapon.isAutoCapable || weapon.attackType === 'Auto';
    openDiceRoller(`1d10+${base + modSum}`, {
      kind: 'attack',
      characterId: character.id,
      weaponId: weapon.id,
      reliability: weapon.reliability,
      isMelee: weapon.weaponType === 'Melee',
      isAutoWeapon,
    });
  };

  // Fire weapon (consume ammo)
  const handleFire = (weapon: Weapon, mode: FireMode) => {
    const success = fireWeapon(character.id, weapon.id, mode);
    if (success) {
      const base = getAttackSkillTotal(weapon);
      const modSum = weapon.weaponType === 'Melee' ? 0 : getRangedModSum(weapon.id);
      const isAutoWeapon = weapon.isAutoCapable || weapon.attackType === 'Auto';
      openDiceRoller(`1d10+${base + modSum}`, {
        kind: 'attack',
        characterId: character.id,
        weaponId: weapon.id,
        reliability: weapon.reliability,
        isMelee: weapon.weaponType === 'Melee',
        isAutoWeapon,
      });
    }
  };

  const baseStunTarget = character.derivedStats?.stunSaveTarget ?? character.stats.bt.total;
  const effectiveStunTarget = baseStunTarget + stunSaveMod;
  const baseDeathTarget = character.derivedStats?.deathSaveTarget ?? -1;
  const effectiveDeathTarget = baseDeathTarget >= 0 ? baseDeathTarget + stunSaveMod : -1;

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Combat Rolls */}
        <section>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const combatSense =
                  character.specialAbility?.name === 'Combat Sense'
                    ? character.specialAbility.value
                    : 0;
                const refTotal = character.stats.ref.total || 0;
                openDiceRoller(`1d10+${refTotal + initMod + combatSense}`);
              }}
              className="border-2 border-black p-3 hover:bg-gray-100 font-bold uppercase"
            >
              Initiative
              <div className="text-xs font-normal mt-1">
                REF {character.stats.ref.total}
                {initMod !== 0 && (
                  <span>
                    {' '}
                    {initMod > 0 ? '+' : ''}
                    {initMod} mod
                  </span>
                )}
                {character.specialAbility?.name === 'Combat Sense' &&
                  ` +${character.specialAbility.value} CS`}
              </div>
            </button>

            <button
              type="button"
              onClick={() => beginStunSaveRoll(character.id)}
              className="border-2 border-black p-3 hover:bg-gray-100 font-bold uppercase"
              title={`Stun/shock: roll one d10 (no exploding 10s). Success if total ≤ ${effectiveStunTarget}; fail sets STUNNED. Optional stun save mod below adds to this target.`}
            >
              Stun Save
              <div className="text-xs font-normal mt-1">
                Target: ≤ {effectiveStunTarget}
                {stunSaveMod !== 0 && (
                  <span className="text-gray-600">
                    {' '}
                    (base {baseStunTarget}, mod {stunSaveMod >= 0 ? '+' : ''}
                    {stunSaveMod})
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => beginDeathSaveRoll(character.id)}
              className={`border-2 border-black p-3 font-bold uppercase ${
                baseDeathTarget >= 0
                  ? 'hover:bg-red-100 border-red-600 text-red-600'
                  : 'bg-gray-100 text-gray-400 cursor-default'
              }`}
              disabled={baseDeathTarget < 0}
              title={
                baseDeathTarget >= 0
                  ? `Death: roll one d10 (flat). Success if ≤ ${effectiveDeathTarget} (same BT + wound row as stun; FNFF). Fail → dead.`
                  : 'Not mortally wounded'
              }
            >
              Death Save
              <div className="text-xs font-normal mt-1">
                {baseDeathTarget >= 0 ? (
                  <>
                    Target: ≤ {effectiveDeathTarget}
                    {stunSaveMod !== 0 && (
                      <span className="text-gray-600">
                        {' '}
                        (base {baseDeathTarget}, mod {stunSaveMod >= 0 ? '+' : ''}
                        {stunSaveMod})
                      </span>
                    )}
                  </>
                ) : (
                  'N/A'
                )}
              </div>
            </button>
          </div>

          <div className="border-2 border-black bg-[#f5f5dc] p-3 mt-2">
            <div className="text-xs font-bold uppercase mb-2">Combat modifiers (gear, drugs, referee)</div>
            <div className="flex flex-wrap gap-4 items-end">
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="font-semibold">Initiative</span>
                {editable ? (
                  <input
                    type="number"
                    value={initMod}
                    onChange={(e) =>
                      setCombatModifier('initiative', parseInt(e.target.value, 10) || 0)
                    }
                    className="w-16 border-2 border-black px-2 py-1 font-mono"
                  />
                ) : (
                  <span className="font-mono font-bold">{initMod}</span>
                )}
                <span className="text-[10px] text-gray-600">Added to initiative roll</span>
              </label>
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="font-semibold">Stun save</span>
                {editable ? (
                  <input
                    type="number"
                    value={stunSaveMod}
                    onChange={(e) =>
                      setCombatModifier('stunSave', parseInt(e.target.value, 10) || 0)
                    }
                    className="w-16 border-2 border-black px-2 py-1 font-mono"
                  />
                ) : (
                  <span className="font-mono font-bold">{stunSaveMod}</span>
                )}
                <span className="text-[10px] text-gray-600">Added to stun &amp; death save targets (easier if +)</span>
              </label>
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-2">
            Saves use a <strong>single flat d10</strong> (no crit explosion). Targets follow the wound-state table (BT +
            row modifiers). <strong>Death</strong>: per FNFF, a failed save while Mortally wounded means death; this app
            sets the wound track to <strong>Dead</strong> (damage 41+). After the roll, <strong>stun</strong> updates
            STUNNED when roll &gt; target. You can still toggle STUNNED manually on the wound tracker.
          </p>

          <div className="border-2 border-teal-900 border-dashed bg-teal-50/70 p-3 mt-3">
            <div className="text-xs font-bold uppercase text-teal-900 mb-1">Stabilization (medic, FNFF)</div>
            <p className="text-xs text-gray-800 mb-2">
              Roll as the <strong>medic</strong> on <strong>this</strong> sheet:{' '}
              <strong>TECH + First Aid or Medical Tech (higher) + 1d10</strong> (exploding d10). Total must be ≥ the
              patient&apos;s full damage; then they stop making death saves until hurt again.
            </p>
            <div className="flex flex-wrap gap-3 items-end text-xs">
              <label className="flex flex-col gap-0.5">
                <span className="font-semibold">Patient damage (target)</span>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={stabilizationTarget}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setStabilizationTarget(
                      Number.isFinite(n) ? Math.max(1, Math.min(40, n)) : 1,
                    );
                  }}
                  className="w-20 border-2 border-black px-2 py-1 font-mono bg-white"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  openDiceRoller(`1d10+${stabBonus}`, {
                    kind: 'stabilization',
                    targetDamage: Math.max(1, Math.min(40, stabilizationTarget)),
                  })
                }
                className="border-2 border-teal-900 bg-teal-200 px-3 py-2 font-bold uppercase hover:bg-teal-300"
              >
                Roll stabilization
              </button>
              <button
                type="button"
                onClick={() =>
                  setStabilizationTarget(Math.max(1, Math.min(40, character.damage)))
                }
                className="border border-teal-800 px-2 py-1 text-[10px] font-bold uppercase hover:bg-teal-100"
                title="Set target to this character’s current damage (when stabilizing yourself or copying from the sheet)"
              >
                Use my damage ({character.damage})
              </button>
            </div>
            <p className="text-[10px] text-teal-950 mt-2">
              Medic bonus on this sheet: <strong>{stabBonus}</strong> (TECH {character.stats.tech.total} + medical{' '}
              {medSkillForStab}). Stabilization does not change the sheet automatically.
            </p>
          </div>

          {editable && (
            <button
              type="button"
              onClick={() => {
                setDamageApplicatorPreset(null);
                setShowDamageApplicator(true);
              }}
              className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white border-2 border-black p-3 font-bold uppercase"
            >
              Apply Damage
            </button>
          )}
        </section>

        {/* Armor Section */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold uppercase border-b-2 border-black pb-1">Armor</h2>
            {totalEncumbrance > 0 && (
              <div className="text-sm font-bold text-orange-600">
                EV: {totalEncumbrance} (REF -{totalEncumbrance})
              </div>
            )}
          </div>

          {/* Hit Locations Grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {locationOrder.map((location) => {
              const hitLoc = character.hitLocations[location];
              const currentSP = Math.max(0, hitLoc.stoppingPower - hitLoc.ablation);
              const layeredSP = calculateLayeredSP(location);

              return (
                <div key={location} className="border-2 border-black p-2 bg-white">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{locationLabels[location]}</span>
                    <span className="text-xs text-gray-500">d10: {hitLocationRollRanges[location]}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div>
                      <span className="text-sm">
                        SP: <span className="font-bold text-lg">{currentSP}</span>
                      </span>
                      {layeredSP > 0 && layeredSP !== currentSP && (
                        <span className="text-xs text-blue-600 ml-1">(Layered: {layeredSP})</span>
                      )}
                    </div>
                    {hitLoc.ablation > 0 && (
                      <span className="text-xs text-orange-600">-{hitLoc.ablation} abl</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Armor Items */}
          {armorItems.length > 0 && (
            <div className="space-y-1">
              {armorItems.map((armor) => {
                const coveredZones = Object.entries(armor.coverage || {})
                  .filter(([, v]) => v.stoppingPower > 0)
                  .map(([zone, v]) => `${zone}:${v.stoppingPower}`);

                return (
                  <div
                    key={armor.id}
                    className={`border-2 p-2 text-sm ${
                      armor.equipped ? 'border-green-600 bg-green-50' : 'border-black'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{armor.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">EV:{armor.encumbrance || 0}</span>
                        {editable ? (
                          <button
                            onClick={() => toggleItemEquipped(armor.id)}
                            className={`text-xs font-bold px-2 py-0.5 border ${
                              armor.equipped
                                ? 'border-green-600 bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600 hover:border-red-600'
                                : 'border-gray-400 text-gray-500 hover:bg-green-100 hover:text-green-700 hover:border-green-600'
                            }`}
                          >
                            {armor.equipped ? 'EQUIPPED' : 'EQUIP'}
                          </button>
                        ) : (
                          armor.equipped && (
                            <span className="text-xs font-bold text-green-600">EQUIPPED</span>
                          )
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Coverage: {coveredZones.join(', ') || 'None'}
                    </div>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => sellItem(character.id, armor.id)}
                        className="mt-1 text-xs font-bold uppercase px-2 py-0.5 border border-amber-600 text-amber-800 hover:bg-amber-50"
                        title={`Sell for 50% (€${Math.floor(armor.cost * 0.5).toLocaleString()})`}
                      >
                        Sell armor
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {editable && (
            <button
              onClick={() => setShowItemBrowser(true)}
              className="w-full mt-2 bg-green-500 hover:bg-green-600 text-white border-2 border-black p-2 font-bold uppercase text-sm"
            >
              + Add Armor/Weapons
            </button>
          )}
          {editable && (armorItems.length > 0 || weapons.length > 0) && (
            <p className="text-xs text-gray-600 mt-2">
              <strong>Sell</strong> pays <strong>50%</strong> of list price (€). Remove (×) on Gear/Cyberware tabs drops the item with no cash.
            </p>
          )}
        </section>

        {/* Weapons Section */}
        <section>
          <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
            Weapons
          </h2>

          {weapons.length === 0 ? (
            <div className="text-center text-gray-500 py-4">No weapons in inventory</div>
          ) : (
            <div className="space-y-2">
              {weapons.map((weapon) => {
                const isExpanded = expandedWeaponId === weapon.id;
                const attackTotal = getAttackSkillTotal(weapon);
                const isMelee = weapon.weaponType === 'Melee';
                const canAuto = weapon.isAutoCapable || weapon.attackType === 'Auto';

                return (
                  <div
                    key={weapon.id}
                    className={`border-2 border-black ${isExpanded ? 'bg-gray-50' : ''}`}
                  >
                    {/* Weapon Header (always visible) */}
                    <div className="flex items-center gap-2 p-2">
                      {editable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleItemEquipped(weapon.id);
                          }}
                          className={`w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center text-xs ${
                            weapon.equipped
                              ? 'border-green-600 bg-green-500 text-white'
                              : 'border-gray-400 hover:border-green-600'
                          }`}
                          title={weapon.equipped ? 'Unequip' : 'Equip'}
                        >
                          {weapon.equipped ? '✓' : ''}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setExpandedWeaponId(isExpanded ? null : weapon.id)
                        }
                        className="flex-grow flex items-center gap-2 hover:bg-gray-100 text-left"
                      >
                        <div className="flex-grow">
                          <div className={`font-bold ${!weapon.equipped ? 'text-gray-400' : ''}`}>
                            {weapon.name}
                          </div>
                          <div className="text-xs text-gray-600 flex gap-3">
                            <span>{weapon.weaponType}</span>
                            <span>DMG: {weapon.damage}{isMelee && sdb !== 0 ? (sdb > 0 ? `+${sdb}` : `${sdb}`) : ''}</span>
                            {!isMelee && (
                              <span>
                                Ammo: {weapon.shotsLeft}/{weapon.shots}
                              </span>
                            )}
                            {weapon.ap && <span className="text-red-600 font-bold">AP</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">+{attackTotal}</div>
                          <div className="text-xs text-gray-600">Attack</div>
                        </div>
                        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                    </div>

                    {/* Expanded Weapon Details */}
                    {isExpanded && (
                      <div className="border-t-2 border-black p-3 space-y-3">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-1 text-xs">
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">WA</div>
                            <div>{weapon.accuracy >= 0 ? `+${weapon.accuracy}` : weapon.accuracy}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Conc</div>
                            <div>{concealabilityLabels[weapon.concealability] || weapon.concealability}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Rel</div>
                            <div>{reliabilityLabels[weapon.reliability] || weapon.reliability}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">ROF</div>
                            <div>{weapon.rof}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Range</div>
                            <div>{weapon.range}m</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Damage</div>
                            <div>{weapon.damage}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Ammo</div>
                            <div>
                              {weapon.shotsLeft}/{weapon.shots}
                            </div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Skill</div>
                            <div>{weapon.attackSkill}</div>
                          </div>
                        </div>

                        {/* Ranged: modifier checklist + bracket DC preview (lookups) */}
                        {!isMelee && (() => {
                          const modSum = getRangedModSum(weapon.id);
                          const effectiveAttack = attackTotal + modSum;
                          const selBracket = selectedRangeByWeapon[weapon.id] ?? 'Close';
                          const selDc = rangeBrackets[selBracket].dc;
                          const needOnD10 = selDc - effectiveAttack;
                          let previewHint: string;
                          if (needOnD10 <= 0) {
                            previewHint = 'Any d10 total meets this DV (before explosions).';
                          } else if (needOnD10 <= 10) {
                            previewHint = `Need d10 ≥ ${needOnD10} (natural on one die; 10 may explode).`;
                          } else {
                            previewHint = `Need ${needOnD10}+ on one d10 before explosions — use exploding 10s.`;
                          }

                          return (
                            <div className="space-y-2">
                              <div>
                                <div className="text-xs font-bold uppercase text-gray-800">
                                  Ranged modifiers (FNFF checklist)
                                </div>
                                <p className="text-[10px] text-gray-600 mt-0.5">
                                  Roll uses <strong>1d10 + {effectiveAttack}</strong> (base {attackTotal}
                                  {modSum !== 0 && (
                                    <>
                                      {' '}
                                      + mods {modSum >= 0 ? '+' : ''}
                                      {modSum}
                                    </>
                                  )}
                                  ). Compare to the bracket <strong>DV</strong> below.
                                </p>
                                <div className="max-h-40 overflow-y-auto border border-black p-2 bg-white grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[10px] mt-1">
                                  {Object.keys(rangedCombatModifiers)
                                    .sort((a, b) => a.localeCompare(b))
                                    .map((label) => (
                                      <label
                                        key={label}
                                        className="flex items-start gap-1 cursor-pointer select-none"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={!!rangedModToggles[weapon.id]?.[label]}
                                          onChange={() => toggleRangedMod(weapon.id, label)}
                                          className="mt-0.5 shrink-0"
                                        />
                                        <span>
                                          {label}{' '}
                                          <span className="text-gray-500">
                                            ({rangedCombatModifiers[label] >= 0 ? '+' : ''}
                                            {rangedCombatModifiers[label]})
                                          </span>
                                        </span>
                                      </label>
                                    ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => clearRangedMods(weapon.id)}
                                  className="text-[10px] mt-1 border border-gray-400 px-2 py-0.5 uppercase hover:bg-gray-100"
                                >
                                  Clear ranged mods
                                </button>
                                {rangedModToggles[weapon.id]?.[AIMED_SHOT_LABEL] && (
                                  <div className="mt-2 border border-amber-800/40 bg-amber-50/50 p-2">
                                    <label className="text-[10px] font-bold uppercase text-amber-950">
                                      Aimed target zone (if hit)
                                    </label>
                                    <select
                                      value={aimedZoneByWeapon[weapon.id] ?? ''}
                                      onChange={(e) =>
                                        setAimedZoneByWeapon((prev) => ({
                                          ...prev,
                                          [weapon.id]: e.target.value,
                                        }))
                                      }
                                      className="mt-1 w-full border border-black bg-white px-2 py-1 text-[11px]"
                                    >
                                      <option value="">— Pick after successful aimed shot —</option>
                                      {locationOrder.map((z) => (
                                        <option key={z} value={z}>
                                          {locationLabels[z]} (d10 {hitLocationRollRanges[z]})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              <div className="border-2 border-dashed border-amber-700/40 bg-amber-50/80 p-2 text-xs">
                                <div className="font-bold uppercase text-amber-900 mb-1">
                                  Attack preview
                                </div>
                                <div className="text-[11px] space-y-0.5">
                                  <div>
                                    Effective attack value: <strong>{effectiveAttack}</strong> (base{' '}
                                    {attackTotal}
                                    {modSum !== 0 && (
                                      <>
                                        , situational modifiers {modSum >= 0 ? '+' : ''}
                                        {modSum}
                                      </>
                                    )}
                                    )
                                  </div>
                                  <div>
                                    Bracket for preview:{' '}
                                    <strong>{rangeBrackets[selBracket].label}</strong> · DV{' '}
                                    <strong>{selDc}</strong>
                                  </div>
                                  <div className="text-gray-800">{previewHint}</div>
                                </div>
                              </div>

                              <div>
                                <div className="text-xs font-bold uppercase mb-1">
                                  Range brackets — click to roll (1d10 + effective vs DV)
                                </div>
                                <div className="grid grid-cols-5 gap-1">
                                  {(
                                    Object.entries(rangeBrackets) as [
                                      RangeBracket,
                                      { dc: number; label: string },
                                    ][]
                                  ).map(([key, { dc, label }]) => {
                                    const selected = selBracket === key;
                                    const distM = getRangeDistance(key, weapon.range);
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        onClick={() => handleAttackRoll(weapon, key)}
                                        className={`border p-1 text-xs text-center transition-colors ${
                                          selected
                                            ? 'border-amber-700 bg-amber-100 ring-1 ring-amber-800'
                                            : 'border-black hover:bg-gray-200'
                                        }`}
                                        title={`Roll 1d10+${effectiveAttack} · DV ${dc} at ${label}`}
                                      >
                                        <div className="font-bold">{label}</div>
                                        <div>DV {dc}</div>
                                        <div className="text-gray-500">
                                          {distM === null ? '—' : `${distM}m`}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Fire Modes */}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleFire(weapon, 'SemiAuto')}
                            disabled={!isMelee && weapon.shotsLeft < 1}
                            className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                          >
                            {isMelee ? 'Attack' : 'Semi-Auto (1)'}
                          </button>

                          {canAuto && (
                            <>
                              <button
                                onClick={() => handleFire(weapon, 'ThreeRoundBurst')}
                                disabled={weapon.shotsLeft < 3}
                                className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                              >
                                Burst (3)
                              </button>
                              <button
                                onClick={() => handleFire(weapon, 'FullAuto')}
                                disabled={weapon.shotsLeft < weapon.rof}
                                className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                              >
                                Full Auto ({weapon.rof})
                              </button>
                              <button
                                onClick={() => handleFire(weapon, 'Suppressive')}
                                disabled={weapon.shotsLeft < weapon.rof}
                                className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                              >
                                Suppress ({weapon.rof})
                              </button>
                            </>
                          )}
                        </div>

                        {/* Reload & Damage */}
                        <div className="flex gap-2">
                          {!isMelee && (
                            <button
                              onClick={() => reloadWeapon(character.id, weapon.id)}
                              className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm bg-blue-50 hover:bg-blue-100"
                            >
                              Reload ({weapon.shots})
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const dmgFormula = isMelee && sdb !== 0
                                ? `${weapon.damage}${sdb >= 0 ? '+' : ''}${sdb}`
                                : weapon.damage;
                              openDiceRoller(dmgFormula);
                            }}
                            className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm bg-red-50 hover:bg-red-100"
                          >
                            Roll Damage ({weapon.damage}{isMelee && sdb !== 0 ? (sdb > 0 ? `+${sdb}` : sdb) : ''})
                          </button>
                        </div>
                        {editable && !isMelee && (
                          <button
                            type="button"
                            onClick={() => {
                              const aimed = !!rangedModToggles[weapon.id]?.[AIMED_SHOT_LABEL];
                              const z = aimedZoneByWeapon[weapon.id] as Zone | undefined;
                              setDamageApplicatorPreset({
                                weaponDamageFormula: weapon.damage || '',
                                pointBlank: false,
                                ...(aimed
                                  ? {
                                      hitLocationMode: 'aimed' as const,
                                      ...(z ? { aimedLocation: z } : {}),
                                    }
                                  : { hitLocationMode: 'random' as const }),
                              });
                              setShowDamageApplicator(true);
                            }}
                            className="w-full mt-2 border-2 border-black bg-white hover:bg-gray-100 p-2 text-xs font-bold uppercase"
                            title="Apply Damage with weapon code, hit location (random d10 or aimed zone), and Roll weapon damage in the dialog."
                          >
                            Apply Damage — resolve hit &amp; location
                          </button>
                        )}
                        {editable && isMelee && weapon.damage && (
                          <button
                            type="button"
                            onClick={() => {
                              const dmgWithSdb =
                                sdb !== 0
                                  ? `${weapon.damage}${sdb >= 0 ? '+' : ''}${sdb}`
                                  : weapon.damage;
                              setDamageApplicatorPreset({
                                weaponDamageFormula: dmgWithSdb,
                                hitLocationMode: 'random',
                              });
                              setShowDamageApplicator(true);
                            }}
                            className="w-full mt-2 border-2 border-gray-600 bg-gray-50 hover:bg-gray-100 p-2 text-xs font-bold uppercase"
                          >
                            Apply Damage — fill weapon code ({sdb !== 0 ? `${weapon.damage}${sdb > 0 ? '+' : ''}${sdb}` : weapon.damage})
                          </button>
                        )}
                        {editable && (
                          <button
                            type="button"
                            onClick={() => sellItem(character.id, weapon.id)}
                            className="w-full mt-2 text-xs font-bold uppercase px-2 py-1 border-2 border-amber-600 text-amber-800 hover:bg-amber-50"
                            title={`Sell for 50% (€${Math.floor(weapon.cost * 0.5).toLocaleString()})`}
                          >
                            Sell weapon
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SDP Tracking */}
        {(character.sdp.sum.rArm > 0 ||
          character.sdp.sum.lArm > 0 ||
          character.sdp.sum.rLeg > 0 ||
          character.sdp.sum.lLeg > 0) && (
          <section>
            <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
              Cyberlimb SDP
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {(['rArm', 'lArm', 'rLeg', 'lLeg'] as Zone[]).map((limb) => {
                const maxSDP = character.sdp.sum[limb];
                const currentSDP = character.sdp.current[limb];

                if (maxSDP === 0) return null;

                return (
                  <div key={limb} className="border-2 border-black p-2 bg-gray-50">
                    <div className="font-bold text-sm uppercase">{locationLabels[limb]}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {editable ? (
                        <input
                          type="number"
                          value={currentSDP}
                          onChange={(e) => {
                            const newSDP = Math.max(
                              0,
                              Math.min(maxSDP, parseInt(e.target.value) || 0),
                            );
                            updateCharacterField(character.id, `sdp.current.${limb}`, newSDP);
                          }}
                          className="w-16 border border-gray-400 px-2 py-1 text-center font-bold"
                          max={maxSDP}
                          min={0}
                        />
                      ) : (
                        <span className="font-bold text-lg">{currentSDP}</span>
                      )}
                      <span className="text-sm text-gray-600">/ {maxSDP}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {showDamageApplicator && (
        <DamageApplicator
          key={`${character.id}-${damageApplicatorPreset ? JSON.stringify(damageApplicatorPreset) : 'default'}`}
          characterId={character.id}
          preset={damageApplicatorPreset}
          onClose={() => {
            setShowDamageApplicator(false);
            setDamageApplicatorPreset(null);
          }}
        />
      )}

      {showItemBrowser && (
        <ItemBrowser characterId={character.id} onClose={() => setShowItemBrowser(false)} />
      )}
    </>
  );
}
