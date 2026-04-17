/**
 * Core Cyberpunk 2020 game formulas
 * Extracted from Foundry VTT system and CP2020 rulebook
 */

import {
  Character,
  Stats,
  StatBlock,
  DerivedStats,
  WoundState,
  WoundPenalties,
  Zone,
  Cyberware,
  Armor,
} from '../types';

/**
 * Get Body Type Modifier (BTM) from Body Type stat
 * BTM reduces incoming damage
 * Source: CP2020 rulebook BTM table
 */
export function btmFromBT(bt: number): number {
  if (bt <= 2) return 0;
  if (bt <= 4) return 1;
  if (bt <= 7) return 2;
  if (bt <= 9) return 3;
  if (bt === 10) return 4;
  return 5; // 11+ (Superhuman, only with cybernetics)
}

/**
 * Get strength damage bonus from Body Type (direct lookup)
 * Used for melee damage
 * Source: CP2020 rulebook / lookups.js
 */
export function strengthDamageBonus(bt: number): number {
  if (bt <= 2) return -2;
  if (bt <= 4) return -1;
  if (bt <= 7) return 0;
  if (bt <= 9) return 1;
  if (bt === 10) return 2;
  if (bt <= 12) return 4;
  if (bt <= 14) return 6;
  return 8; // 15+
}

/**
 * Calculate the effective total for a stat, incorporating all modifiers
 */
export function calculateStatTotal(stat: StatBlock): number {
  return Math.max(0, stat.base + stat.tempMod + stat.cyberMod + stat.armorMod + stat.woundMod);
}

/**
 * Calculate all derived stats for a character
 */
export function calculateDerivedStats(character: Character): DerivedStats {
  const stats = character.stats;

  // Step 1: Calculate base stat totals (base + tempMod + cyberMod)
  const rawTotals: Record<keyof Stats, number> = {} as Record<keyof Stats, number>;
  for (const key of Object.keys(stats) as Array<keyof Stats>) {
    rawTotals[key] = stats[key].base + stats[key].tempMod + stats[key].cyberMod;
  }

  // Step 2: Calculate armor encumbrance penalty on REF
  let armorEncumbrance = 0;
  character.items
    .filter((item): item is Armor => item.type === 'armor' && item.equipped)
    .forEach((armor) => {
      armorEncumbrance += armor.encumbrance || 0;
    });

  // Step 3: Wound state (need this before applying wound penalties to stats)
  const { woundState } = calculateWoundState(character.damage);

  // Step 4: Compute wound modifiers for REF/INT/COOL
  let refWoundMod = 0;
  let intWoundMod = 0;
  let coolWoundMod = 0;

  const baseRefTotal = rawTotals.ref - armorEncumbrance;
  const baseIntTotal = rawTotals.int;
  const baseCoolTotal = rawTotals.cool;

  if (woundState === 'Serious') {
    refWoundMod = -2;
  } else if (woundState === 'Critical') {
    // Halved: the wound mod is the difference between full and halved
    refWoundMod = -(baseRefTotal - Math.ceil(baseRefTotal / 2));
    intWoundMod = -(baseIntTotal - Math.ceil(baseIntTotal / 2));
    coolWoundMod = -(baseCoolTotal - Math.ceil(baseCoolTotal / 2));
  } else if (woundState.startsWith('Mortal')) {
    // Reduced to 1/3
    refWoundMod = -(baseRefTotal - Math.ceil(baseRefTotal / 3));
    intWoundMod = -(baseIntTotal - Math.ceil(baseIntTotal / 3));
    coolWoundMod = -(baseCoolTotal - Math.ceil(baseCoolTotal / 3));
  } else if (woundState === 'Dead') {
    refWoundMod = -999;
    intWoundMod = -999;
    coolWoundMod = -999;
  }

  // Step 5: BTM from body type
  const btTotal = rawTotals.bt;
  const btm = btmFromBT(btTotal);

  // Step 6: Movement
  const maTotal = rawTotals.ma;
  const run = maTotal * 3;
  const leap = Math.floor(run / 4);

  // Step 7: Carrying capacity
  const carry = btTotal * 10;
  const lift = btTotal * 40;

  // Step 8: Humanity and Empathy (canonical formula from rulebook)
  const empBase = rawTotals.emp;
  const baseHumanity = empBase * 10;

  let humanityLoss = 0;
  character.items
    .filter((item): item is Cyberware => item.type === 'cyberware' && item.equipped)
    .forEach((cyberware) => {
      humanityLoss += cyberware.humanityLoss || 0;
    });

  const humanity = Math.max(0, baseHumanity - humanityLoss);
  const currentEmp = Math.max(0, Math.ceil(humanity / 10));

  // Step 9: Save number = BT
  const saveNumber = btTotal;

  // Step 10: Stun/Death save targets per wound state
  const stunSaveTarget = calculateStunSaveTarget(woundState, saveNumber);
  const deathSaveTarget = calculateDeathSaveTarget(woundState, saveNumber);

  return {
    btm,
    strengthDamageBonus: strengthDamageBonus(btTotal),
    run,
    leap,
    carry,
    lift,
    humanity,
    currentEmp,
    saveNumber,
    woundState,
    woundPenalties: {
      ref: refWoundMod,
      int: intWoundMod,
      cool: coolWoundMod,
    },
    stunSaveTarget,
    deathSaveTarget,
  };
}

/**
 * Recalculate and mutate stat totals on a character using derived info.
 * Call this after calculateDerivedStats to update stat.total fields.
 */
export function applyStatModifiers(character: Character): void {
  const derived = character.derivedStats;
  if (!derived) return;

  const stats = character.stats;

  // Calculate armor encumbrance
  let armorEncumbrance = 0;
  character.items
    .filter((item): item is Armor => item.type === 'armor' && item.equipped)
    .forEach((armor) => {
      armorEncumbrance += armor.encumbrance || 0;
    });

  // Calculate cyberware stat mods
  const cyberMods: Partial<Record<keyof Stats, number>> = {};
  character.items
    .filter((item): item is Cyberware => item.type === 'cyberware' && item.equipped)
    .forEach((cyberware) => {
      if (cyberware.statMods) {
        for (const [stat, mod] of Object.entries(cyberware.statMods)) {
          const key = stat as keyof Stats;
          cyberMods[key] = (cyberMods[key] || 0) + (mod || 0);
        }
      }
    });

  for (const key of Object.keys(stats) as Array<keyof Stats>) {
    stats[key].cyberMod = cyberMods[key] || 0;
    stats[key].armorMod = key === 'ref' ? -armorEncumbrance : 0;

    if (key === 'ref') {
      stats[key].woundMod = derived.woundPenalties.ref;
    } else if (key === 'int') {
      stats[key].woundMod = derived.woundPenalties.int;
    } else if (key === 'cool') {
      stats[key].woundMod = derived.woundPenalties.cool;
    } else {
      stats[key].woundMod = 0;
    }

    stats[key].total = calculateStatTotal(stats[key]);
  }

  // Override EMP total with humanity-derived value
  if (stats.emp) stats.emp.total = derived.currentEmp;
}

/**
 * Sync equipped armor coverage into character.hitLocations.
 * Computes layered SP per zone from all equipped armor pieces.
 * Preserves existing ablation so damage history is not lost.
 */
export function syncArmorToHitLocations(character: Character): void {
  const zones: Zone[] = ['Head', 'Torso', 'rArm', 'lArm', 'rLeg', 'lLeg'];
  const equippedArmor = character.items.filter(
    (item): item is Armor => item.type === 'armor' && item.equipped,
  );

  for (const zone of zones) {
    const spValues: number[] = [];
    for (const armor of equippedArmor) {
      const cov = armor.coverage?.[zone];
      if (cov && cov.stoppingPower > 0) {
        spValues.push(cov.stoppingPower);
      }
    }

    const layeredSP = spValues.length === 0
      ? 0
      : spValues.length === 1
        ? spValues[0]
        : maxLayeredSP(spValues);

    const existing = character.hitLocations[zone];
    character.hitLocations[zone] = {
      ...existing,
      stoppingPower: layeredSP,
    };
  }
}

/**
 * Calculate wound state and stat penalties from damage total
 */
export function calculateWoundState(damage: number): {
  woundState: WoundState;
  woundPenalties: WoundPenalties;
} {
  const penalties: WoundPenalties = { ref: 0, int: 0, cool: 0 };

  if (damage === 0) {
    return { woundState: 'Uninjured', woundPenalties: penalties };
  }

  if (damage >= 41) {
    return {
      woundState: 'Dead',
      woundPenalties: { ref: -999, int: -999, cool: -999 },
    };
  }

  const woundLevel = Math.ceil(damage / 4);

  if (woundLevel === 1) {
    return { woundState: 'Light', woundPenalties: penalties };
  }

  if (woundLevel === 2) {
    penalties.ref = -2;
    return { woundState: 'Serious', woundPenalties: penalties };
  }

  if (woundLevel === 3) {
    return { woundState: 'Critical', woundPenalties: penalties };
  }

  // Mortal 0-6 (woundLevel 4-10)
  const mortalLevel = Math.min(6, woundLevel - 4);
  return {
    woundState: `Mortal${mortalLevel}` as WoundState,
    woundPenalties: penalties,
  };
}

/**
 * Stun save target: must roll <= (BT - woundStateModifier) on 1d10
 * Light=0, Serious=-1, Critical=-2, Mortal0=-3, Mortal1=-4, ... Mortal6=-9
 */
export function calculateStunSaveTarget(woundState: WoundState, saveNumber: number): number {
  const modifiers: Record<WoundState, number> = {
    Uninjured: 0,
    Light: 0,
    Serious: -1,
    Critical: -2,
    Mortal0: -3,
    Mortal1: -4,
    Mortal2: -5,
    Mortal3: -6,
    Mortal4: -7,
    Mortal5: -8,
    Mortal6: -9,
    Dead: -10,
  };
  return saveNumber + (modifiers[woundState] || 0);
}

/**
 * Death save target: BT minus the mortal wound's own severity number.
 * Per FNFF (CP2020Gameplay.md): "Mortal 4 wound. He must roll lower than (10−4)=6 to stay alive."
 * The death save uses only the mortal digit (0..6) — NOT the harsher stun-row penalty.
 * Returns -1 if not applicable (not mortally wounded).
 */
export function calculateDeathSaveTarget(woundState: WoundState, saveNumber: number): number {
  if (!woundState.startsWith('Mortal')) return -1;
  const mortalLevel = Number(woundState.slice('Mortal'.length));
  if (!Number.isFinite(mortalLevel)) return -1;
  return saveNumber - mortalLevel;
}

/**
 * Single flat d10 vs target (stun/death saves): success if roll ≤ target
 * (FNFF: roll equal to or lower than BT minus wound severity / mortality).
 */
export function isFlatSaveSuccess(rollTotal: number, target: number): boolean {
  return rollTotal <= target;
}

/**
 * Combine two armor SP values using the layering formula
 */
export function combineSP(a: number, b: number): number {
  const spA = Number(a) || 0;
  const spB = Number(b) || 0;

  if (!spA) return spB;
  if (!spB) return spA;

  const diff = Math.abs(spA - spB);
  let mod: number;

  if (diff >= 27) mod = 0;
  else if (diff >= 21) mod = 1;
  else if (diff >= 15) mod = 2;
  else if (diff >= 9) mod = 3;
  else if (diff >= 5) mod = 4;
  else mod = 5;

  return Math.max(spA, spB) + mod;
}

/**
 * Calculate maximum layered SP for 3+ armor pieces
 * Uses dynamic programming for optimal layering order (up to 16 layers)
 */
export function maxLayeredSP(spValues: number[]): number {
  if (!spValues || !spValues.length) return 0;

  const sp = spValues.map((v) => Number(v) || 0).filter((v) => v > 0);

  const n = sp.length;
  if (!n) return 0;
  if (n === 1) return sp[0];

  const MAX_EXACT_LAYERS = 16;

  if (n <= MAX_EXACT_LAYERS) {
    const size = 1 << n;
    const dp = new Array(size).fill(0);

    for (let mask = 1; mask < size; mask++) {
      let best = 0;
      for (let i = 0; i < n; i++) {
        const bit = 1 << i;
        if (!(mask & bit)) continue;
        const prevMask = mask ^ bit;
        const val = combineSP(dp[prevMask], sp[i]);
        if (val > best) best = val;
      }
      dp[mask] = best;
    }

    return dp[size - 1];
  }

  // Greedy approximation for too many layers
  let current = 0;
  const remaining = [...sp];

  while (remaining.length) {
    let bestIdx = 0;
    let bestVal = combineSP(current, remaining[0]);

    for (let i = 1; i < remaining.length; i++) {
      const val = combineSP(current, remaining[i]);
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }

    current = bestVal;
    remaining.splice(bestIdx, 1);
  }

  return current;
}

const LIMB_ZONES: readonly Zone[] = ['rArm', 'lArm', 'rLeg', 'lLeg'];

/**
 * Full damage pipeline: calculates final damage after all reductions.
 * Returns the actual damage to add plus flags for book-mandated side effects.
 *
 * Book refs (CP2020Gameplay.md §7 Friday Night Firefight):
 *  - Head Hits: "A head hit always doubles damage." (L6426)
 *  - AP: halves SP before subtraction (L6346)
 *  - BTM min-1: "A Body Type Modifier may never reduce damage to less than one" (L6407)
 *  - Ablation / Staged Penetration: ablate "each time the armor is struck by a PENETRATING
 *    attack (i.e., an attack that actually exceeds the armor's SP)" (L6350)
 *  - Limb Loss: ">8 damage to a limb area in any one attack → severed, immediate Death
 *    Save at Mortal 0. A head wound of this type will kill automatically." (L6424)
 */
export function calculateDamage(
  rawDamage: number,
  location: Zone | null,
  sp: number,
  btm: number,
  isAP: boolean,
): {
  finalDamage: number;
  headMultiplied: boolean;
  effectiveSP: number;
  spReduction: number;
  btmReduction: number;
  /** Attack exceeded effective SP (armor was pierced). Drives ablation + BTM min-1. */
  penetrated: boolean;
  /** BTM would have reduced damage below 1; floored to 1 per FNFF. */
  btmClampedToOne: boolean;
  /** Final damage > 8 to a limb zone; limb severed + forced Mortal-0 death save. */
  limbSevered: boolean;
  /** Final damage > 8 to head; character dies automatically. */
  headAutoKill: boolean;
} {
  let damage = Math.max(0, Math.floor(rawDamage || 0));
  let headMultiplied = false;

  if (location === 'Head') {
    damage = damage * 2;
    headMultiplied = true;
  }

  let effectiveSP = Math.max(0, Math.floor(sp || 0));
  if (isAP) {
    effectiveSP = Math.floor(effectiveSP / 2);
  }

  const spReduction = Math.min(damage, effectiveSP);
  damage = Math.max(0, damage - effectiveSP);
  const penetrated = damage > 0;

  const btmValue = Math.max(0, Math.floor(btm || 0));
  const btmReduction = Math.min(damage, btmValue);
  let damageAfterBtm = Math.max(0, damage - btmValue);

  let btmClampedToOne = false;
  if (penetrated && damageAfterBtm === 0) {
    damageAfterBtm = 1;
    btmClampedToOne = true;
  }

  const limbSevered =
    location !== null && LIMB_ZONES.includes(location) && damageAfterBtm > 8;
  const headAutoKill = location === 'Head' && damageAfterBtm > 8;

  return {
    finalDamage: damageAfterBtm,
    headMultiplied,
    effectiveSP,
    spReduction,
    btmReduction,
    penetrated,
    btmClampedToOne,
    limbSevered,
    headAutoKill,
  };
}

/**
 * FNFF stabilization (medic): TECH + highest of First Aid / Medical Tech + 1d10 ≥ patient total damage.
 */
export function getStabilizationMedicBonus(character: Character): number {
  const tech = character.stats.tech.total ?? 0;
  let maxMed = 0;
  for (const s of character.skills) {
    const n = s.name.trim().toLowerCase();
    if (n === 'first aid' || n === 'medical tech') {
      maxMed = Math.max(maxMed, s.value);
    }
  }
  return tech + maxMed;
}
