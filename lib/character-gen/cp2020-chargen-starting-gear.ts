/**
 * CP2020 starting gear for PC chargen: Fast Character System tables (core rules p.30) —
 * armor + weapon (1D10 + role modifier) and cyberware (1D10 × 3 or 6 for Solos, duplicates re-rolled).
 */

import {
  armorFromTableIndex,
  rollArmorWeaponTableRoll,
  weaponFromTableIndex,
} from '@/lib/npc/cp2020-fast-npc';
import type { Armor, CharacterItem, Cyberware, RoleType, Weapon } from '@/lib/types';
import { rollD10, rollD6, type Cp2020Rng } from './cp2020-char-gen';

function cyberBase(
  p: Pick<Cyberware, 'name' | 'surgCode' | 'humanityCost' | 'humanityLoss' | 'cyberwareType'> &
    Partial<Pick<Cyberware, 'initiativeBonus' | 'statMods'>>,
): Cyberware {
  return {
    id: crypto.randomUUID(),
    type: 'cyberware',
    equipped: true,
    cost: 0,
    weight: 0,
    flavor: 'CP2020 chargen — Fast NPC cyber table (p.30)',
    notes: '',
    source: 'Cyberpunk 2020',
    ...p,
  };
}

function cyberOpticSubtype(rng: Cp2020Rng): string {
  switch (rollD6(rng)) {
    case 1:
      return 'Infrared';
    case 2:
      return 'Lowlight';
    case 3:
    case 4:
      return 'Camera';
    case 5:
      return 'Antidazzle';
    default:
      return 'Targeting scope';
  }
}

function cyberarmGunSubtype(rng: Cp2020Rng): string {
  switch (rollD6(rng)) {
    case 1:
    case 3:
      return 'Medium Pistol';
    case 2:
      return 'Light Pistol';
    case 4:
      return 'Light Submachinegun';
    case 5:
      return 'Very Heavy Pistol';
    default:
      return 'Heavy Pistol';
  }
}

function cyberaudioSubtype(rng: Cp2020Rng): string {
  switch (rollD6(rng)) {
    case 1:
      return 'Wearman™';
    case 2:
      return 'Radio Splice';
    case 3:
      return 'Phone link';
    case 4:
      return 'Amplified Hearing';
    case 5:
      return 'Sound Editing';
    default:
      return 'Digital Recording Link';
  }
}

/** One roll on the p.30 cyber table (1–10); sub-rolls use D6 where the book specifies. */
function cyberFromTableRoll(main: number, rng: Cp2020Rng): Cyberware | null {
  switch (main) {
    case 1:
      return cyberBase({
        name: `Cyberoptic (${cyberOpticSubtype(rng)})`,
        surgCode: 'M',
        humanityCost: '2d6',
        humanityLoss: 7,
        cyberwareType: 'optic',
      });
    case 2:
      return cyberBase({
        name: `Cyberarm w/ gun (${cyberarmGunSubtype(rng)})`,
        surgCode: 'MA',
        humanityCost: '3d6',
        humanityLoss: 11,
        cyberwareType: 'limb',
      });
    case 3:
      return cyberBase({
        name: `Cyberaudio (${cyberaudioSubtype(rng)})`,
        surgCode: 'M',
        humanityCost: '2d6',
        humanityLoss: 7,
        cyberwareType: 'audio',
      });
    case 4:
      return cyberBase({
        name: 'Big Knucks',
        surgCode: 'N',
        humanityCost: '3d6',
        humanityLoss: 10,
        cyberwareType: 'weapon',
      });
    case 5:
      return cyberBase({
        name: 'Ripper Hand',
        surgCode: 'M',
        humanityCost: '4d6',
        humanityLoss: 14,
        cyberwareType: 'weapon',
      });
    case 6:
      return cyberBase({
        name: 'Vampires (hand razors)',
        surgCode: 'M',
        humanityCost: '3d6',
        humanityLoss: 10,
        cyberwareType: 'weapon',
      });
    case 7:
      return cyberBase({
        name: "Slice n'Dice",
        surgCode: 'M',
        humanityCost: '3d6',
        humanityLoss: 10,
        cyberwareType: 'weapon',
      });
    case 8:
      return cyberBase({
        name: 'Kerenzikov Boosterware I',
        surgCode: 'N',
        humanityCost: '1d6',
        humanityLoss: 4,
        cyberwareType: 'NEURALWARE',
        initiativeBonus: 1,
      });
    case 9:
      return cyberBase({
        name: 'Sandevistan Speedware',
        surgCode: 'N',
        humanityCost: '1d6/2',
        humanityLoss: 2,
        cyberwareType: 'NEURALWARE',
        initiativeBonus: 3,
      });
    default:
      return null;
  }
}

function rollDistinctCyberMainRolls(count: number, rng: Cp2020Rng): number[] {
  const out: number[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 25) {
    guard++;
    const v = rollD10(rng);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** Cyberware only — p.30 Step 3 (Solos 6 picks, others 3; duplicate d10 results re-rolled). */
export function rollChargenCyberware(role: RoleType, rng: Cp2020Rng): Cyberware[] {
  const n = role === 'Solo' ? 6 : 3;
  const mains = rollDistinctCyberMainRolls(n, rng);
  const list: Cyberware[] = [];
  for (const m of mains) {
    const c = cyberFromTableRoll(m, rng);
    if (c) list.push(c);
  }
  return list;
}

export interface ChargenStartingGearResult {
  items: CharacterItem[];
  armorName: string;
  weaponName: string;
  armor: Armor;
  weapon: Weapon;
  cyberware: Cyberware[];
  /** Natural D10, role modifier, and final row 1–10 (same row picks armor + weapon). */
  armorWeaponTable: { d10: number; modifier: number; tableIndex: number };
}

/** Armor + weapon (p.30 Step 4) and cyberware (Step 3). */
export function rollChargenStartingGear(role: RoleType, rng: Cp2020Rng): ChargenStartingGearResult {
  const armorWeaponTable = rollArmorWeaponTableRoll(role, rng);
  const idx = armorWeaponTable.tableIndex;
  const { name: armorName, armor } = armorFromTableIndex(idx);
  const { name: weaponName, weapon } = weaponFromTableIndex(idx, rng);
  const cyberware = rollChargenCyberware(role, rng);
  const items: CharacterItem[] = [...cyberware, armor, weapon];
  return { items, armorName, weaponName, armor, weapon, cyberware, armorWeaponTable };
}
