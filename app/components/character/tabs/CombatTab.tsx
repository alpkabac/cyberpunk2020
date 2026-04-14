'use client';

import { useState } from 'react';
import { Character, Zone, Weapon, Armor, FireMode } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { DamageApplicator } from '../DamageApplicator';
import { ItemBrowser } from '../ItemBrowser';
import { maxLayeredSP } from '@/lib/game-logic/formulas';
import {
  fireModes,
  rangeBrackets,
  getRangeDistance,
  reliabilityLabels,
  concealabilityLabels,
  hitLocationRollRanges,
  RangeBracket,
} from '@/lib/game-logic/lookups';

interface CombatTabProps {
  character: Character;
  editable: boolean;
}

export function CombatTab({ character, editable }: CombatTabProps) {
  const [showDamageApplicator, setShowDamageApplicator] = useState(false);
  const [showItemBrowser, setShowItemBrowser] = useState(false);
  const [expandedWeaponId, setExpandedWeaponId] = useState<string | null>(null);

  const openDiceRoller = useGameStore((state) => state.openDiceRoller);
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const fireWeapon = useGameStore((state) => state.fireWeapon);
  const reloadWeapon = useGameStore((state) => state.reloadWeapon);

  const toggleItemEquipped = (itemId: string) => {
    const updatedItems = character.items.map((i) =>
      i.id === itemId ? { ...i, equipped: !i.equipped } : i,
    );
    updateCharacterField(character.id, 'items', updatedItems);
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

  // Roll attack for a weapon at a given range
  const handleAttackRoll = (weapon: Weapon, rangeBracket: RangeBracket) => {
    const total = getAttackSkillTotal(weapon);
    const dc = rangeBrackets[rangeBracket].dc;
    openDiceRoller(`1d10+${total}`);
  };

  // Fire weapon (consume ammo)
  const handleFire = (weapon: Weapon, mode: FireMode) => {
    const success = fireWeapon(character.id, weapon.id, mode);
    if (success) {
      const total = getAttackSkillTotal(weapon);
      openDiceRoller(`1d10+${total}`);
    }
  };

  // Stun save: roll 1d10 <= target
  const stunTarget = character.derivedStats?.stunSaveTarget ?? character.stats.bt.total;
  const deathTarget = character.derivedStats?.deathSaveTarget ?? -1;

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Combat Rolls */}
        <section>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const initMod = character.combatModifiers?.initiative || 0;
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
                {character.specialAbility?.name === 'Combat Sense' &&
                  ` +${character.specialAbility.value} CS`}
              </div>
            </button>

            <button
              onClick={() => openDiceRoller('1d10')}
              className="border-2 border-black p-3 hover:bg-gray-100 font-bold uppercase"
              title={`Must roll ≤ ${stunTarget} on 1d10`}
            >
              Stun Save
              <div className="text-xs font-normal mt-1">Target: ≤ {stunTarget}</div>
            </button>

            <button
              onClick={() => openDiceRoller('1d10')}
              className={`border-2 border-black p-3 font-bold uppercase ${
                deathTarget >= 0
                  ? 'hover:bg-red-100 border-red-600 text-red-600'
                  : 'bg-gray-100 text-gray-400 cursor-default'
              }`}
              disabled={deathTarget < 0}
              title={deathTarget >= 0 ? `Must roll ≤ ${deathTarget} on 1d10` : 'Not mortally wounded'}
            >
              Death Save
              <div className="text-xs font-normal mt-1">
                {deathTarget >= 0 ? `Target: ≤ ${deathTarget}` : 'N/A'}
              </div>
            </button>
          </div>

          {editable && (
            <button
              onClick={() => setShowDamageApplicator(true)}
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

                        {/* Range Brackets (ranged weapons only) */}
                        {!isMelee && (
                          <div>
                            <div className="text-xs font-bold uppercase mb-1">
                              Range Brackets (1d10+{attackTotal} vs DC)
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {(
                                Object.entries(rangeBrackets) as [
                                  RangeBracket,
                                  { dc: number; label: string },
                                ][]
                              ).map(([key, { dc, label }]) => (
                                <button
                                  key={key}
                                  onClick={() => handleAttackRoll(weapon, key)}
                                  className="border border-black p-1 text-xs hover:bg-gray-200 text-center"
                                >
                                  <div className="font-bold">{label}</div>
                                  <div>DC {dc}</div>
                                  <div className="text-gray-500">
                                    {getRangeDistance(key, weapon.range)}m
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

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
          characterId={character.id}
          onClose={() => setShowDamageApplicator(false)}
        />
      )}

      {showItemBrowser && (
        <ItemBrowser characterId={character.id} onClose={() => setShowItemBrowser(false)} />
      )}
    </>
  );
}
