'use client';

import { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import {
  searchAllItems,
  SearchResult,
  Weapon as DataWeapon,
  Armor as DataArmor,
  Cyberware as DataCyberware,
  Vehicle as DataVehicle,
  Program as DataProgram,
  resolveCyberwareHumanityLoss,
} from '@/lib/data/game-data';
import {
  CharacterItem,
  MiscItem,
  Weapon,
  Armor,
  Cyberware,
  Vehicle,
  Program,
  Zone,
  WeaponType,
  Concealability,
  Availability,
  Reliability,
} from '@/lib/types';

interface ItemBrowserProps {
  characterId: string;
  onClose: () => void;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function convertWeapon(src: DataWeapon): Weapon {
  const concMap: Record<string, Concealability> = {
    ConcealPocket: 'P', Pocket: 'P', P: 'P',
    ConcealJacket: 'J', Jacket: 'J', J: 'J',
    ConcealLongcoat: 'L', Longcoat: 'L', L: 'L',
    ConcealNoHide: 'N', NoHide: 'N', N: 'N',
  };
  const availMap: Record<string, Availability> = {
    Excellent: 'E', E: 'E', Common: 'C', C: 'C', Rare: 'R', R: 'R', Poor: 'P', P: 'P',
  };
  const relMap: Record<string, Reliability> = {
    VeryReliable: 'VR', VR: 'VR', Standard: 'ST', ST: 'ST', Unreliable: 'UR', UR: 'UR',
  };
  const wtMap: Record<string, WeaponType> = {
    Pistol: 'Pistol', SMG: 'SMG', Submachinegun: 'SMG',
    Shotgun: 'Shotgun', Rifle: 'Rifle', Heavy: 'Heavy',
    Melee: 'Melee', Exotic: 'Exotic',
  };

  return {
    id: `weapon-${uid()}`,
    name: src.name,
    type: 'weapon',
    flavor: src.flavor || '',
    notes: src.notes || '',
    cost: src.cost,
    weight: src.weight,
    equipped: false,
    source: src.source || 'Reference',
    weaponType: wtMap[src.weapon_type] || 'Exotic',
    accuracy: src.accuracy,
    concealability: concMap[src.concealability] || 'J',
    availability: availMap[src.availability] || 'C',
    ammoType: src.ammo_type || '',
    damage: src.damage || '0',
    ap: src.ap || false,
    shotsLeft: src.shots,
    shots: src.shots,
    rof: src.rof || 1,
    reliability: relMap[src.reliability] || 'ST',
    range: src.range || 0,
    attackType: src.attack_type || '',
    attackSkill: src.attack_skill || '',
    isAutoCapable: (src.attack_type || '').toLowerCase() === 'auto' || src.rof > 1,
  };
}

function convertArmor(src: DataArmor): Armor {
  const coverage: Record<Zone, { stoppingPower: number; ablation: number }> = {
    Head: { stoppingPower: 0, ablation: 0 },
    Torso: { stoppingPower: 0, ablation: 0 },
    rArm: { stoppingPower: 0, ablation: 0 },
    lArm: { stoppingPower: 0, ablation: 0 },
    rLeg: { stoppingPower: 0, ablation: 0 },
    lLeg: { stoppingPower: 0, ablation: 0 },
  };
  if (src.coverage) {
    for (const [zone, val] of Object.entries(src.coverage)) {
      const key = zone as Zone;
      if (key in coverage && val) {
        coverage[key] = {
          stoppingPower: val.stoppingPower || 0,
          ablation: val.ablation || 0,
        };
      }
    }
  }

  return {
    id: `armor-${uid()}`,
    name: src.name,
    type: 'armor',
    flavor: src.flavor || '',
    notes: src.notes || '',
    cost: src.cost,
    weight: src.weight,
    equipped: false,
    source: src.source || 'Reference',
    coverage,
    encumbrance: src.encumbrance || 0,
  };
}

function convertCyberware(src: DataCyberware): Cyberware {
  const cw: Cyberware = {
    id: `cyber-${uid()}`,
    name: src.name,
    type: 'cyberware',
    flavor: src.flavor || '',
    notes: src.notes || '',
    cost: src.cost,
    weight: src.weight,
    equipped: false,
    source: src.source || 'Reference',
    surgCode: src.surg_code || '',
    humanityCost: src.humanity_cost || '0',
    humanityLoss: resolveCyberwareHumanityLoss(src.humanity_loss, src.humanity_cost || ''),
    cyberwareType: src.cyberware_type || '',
  };
  if (src.stat_mods && Object.keys(src.stat_mods).length > 0) {
    cw.statMods = src.stat_mods as Cyberware['statMods'];
  }
  if (typeof src.initiative_bonus === 'number' && src.initiative_bonus !== 0) {
    cw.initiativeBonus = src.initiative_bonus;
  }
  return cw;
}

function convertVehicle(src: DataVehicle): Vehicle {
  return {
    id: `vehicle-${uid()}`,
    name: src.name,
    type: 'vehicle',
    flavor: src.flavor || '',
    notes: src.notes || '',
    cost: src.cost,
    weight: src.weight,
    equipped: false,
    source: src.source || 'Reference',
    vehicleType: src.vehicle_type || '',
    topSpeed: src.top_speed || 0,
    acceleration: src.acceleration || 0,
    handling: src.handling || 0,
    vehicleArmor: src.armor || 0,
    vehicleSdp: src.sdp || 0,
  };
}

function convertProgram(src: DataProgram): Program {
  return {
    id: `program-${uid()}`,
    name: src.name,
    type: 'program',
    flavor: src.description || '',
    notes: '',
    cost: src.cost,
    weight: 0,
    equipped: false,
    source: src.source || 'Reference',
    programType: src.program_type || '',
    strength: src.strength || 0,
    muCost: src.mu_cost || 0,
    programClass: src.program_class || '',
    options: Array.isArray(src.options) ? [...src.options] : [],
  };
}

function convertGear(src: Record<string, unknown>): MiscItem {
  return {
    id: `misc-${uid()}`,
    name: String(src.name || 'Unknown'),
    type: 'misc',
    flavor: String(src.flavor || src.description || ''),
    notes: String(src.notes || ''),
    cost: Number(src.cost) || 0,
    weight: Number(src.weight) || 0,
    equipped: false,
    source: String(src.source || 'Reference'),
  };
}

function convertSearchResult(result: SearchResult): CharacterItem {
  const raw = result.item;
  switch (result.type) {
    case 'weapon':
      return convertWeapon(raw as DataWeapon);
    case 'armor':
      return convertArmor(raw as DataArmor);
    case 'cyberware':
      return convertCyberware(raw as DataCyberware);
    case 'vehicle':
      return convertVehicle(raw as DataVehicle);
    case 'program':
      return convertProgram(raw as DataProgram);
    default:
      return convertGear(raw as unknown as Record<string, unknown>);
  }
}

export function ItemBrowser({ characterId, onClose }: ItemBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [banner, setBanner] = useState<{ msg: string; kind: 'ok' | 'bad' } | null>(null);

  const addItem = useGameStore((state) => state.addItem);
  const deductMoney = useGameStore((state) => state.deductMoney);
  const character = useGameStore(
    (state) => state.characters.byId[characterId] ?? state.npcs.byId[characterId],
  );

  const showBanner = (msg: string, kind: 'ok' | 'bad') => {
    setBanner({ msg, kind });
    window.setTimeout(() => setBanner(null), 3500);
  };

  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    const searchItems = async () => {
      setIsLoading(true);
      try {
        const allResults = await searchAllItems(searchQuery);
        const filtered =
          selectedType === 'all'
            ? allResults
            : allResults.filter((r) => r.type === selectedType);
        setResults(filtered);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(searchItems, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, selectedType]);

  const handleAddItem = (result: SearchResult, purchase: boolean = false) => {
    const converted = convertSearchResult(result);

    if (purchase && character) {
      if (converted.cost > 0 && character.eurobucks < converted.cost) {
        const short = converted.cost - character.eurobucks;
        showBanner(
          `Not enough eurobucks — need €${converted.cost.toLocaleString()}, have €${character.eurobucks.toLocaleString()} (short €${short.toLocaleString()})`,
          'bad',
        );
        return;
      }
      if (converted.cost > 0) {
        deductMoney(characterId, converted.cost);
      }
      addItem(characterId, converted);
      showBanner(
        converted.cost > 0
          ? `Purchased: ${converted.name} (−€${converted.cost.toLocaleString()})`
          : `Added: ${converted.name} (€0)`,
        'ok',
      );
      return;
    }

    addItem(characterId, converted);
    showBanner(`Added to inventory: ${converted.name} (no charge)`, 'ok');
  };

  const canAfford = (cost: number) => {
    return character && character.eurobucks >= cost;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white border-4 border-black w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="border-b-4 border-black p-4 flex justify-between items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold uppercase">Item Browser</h2>
            {character != null && (
              <p
                className="text-sm font-mono mt-1 text-gray-700"
                title="Current wallet balance. Purchase deducts from this."
              >
                Balance:{' '}
                <span className="font-bold text-black">€{character.eurobucks.toLocaleString()}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-3xl font-bold hover:text-red-600" type="button">
            ×
          </button>
        </div>

        {banner && (
          <div
            className={`mx-4 mt-3 px-3 py-2 border-2 text-sm font-bold ${
              banner.kind === 'ok'
                ? 'bg-green-100 border-green-700 text-green-900'
                : 'bg-red-100 border-red-700 text-red-900'
            }`}
            role="status"
          >
            {banner.msg}
          </div>
        )}

        <div className="border-b-2 border-black p-4 space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="w-full border-2 border-black px-3 py-2 text-lg"
            autoFocus
          />

          <div className="flex gap-2 flex-wrap">
            {['all', 'weapon', 'armor', 'cyberware', 'gear', 'vehicle', 'program'].map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1 border-2 border-black uppercase text-sm font-bold ${
                  selectedType === type ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <div className="text-center py-8 text-gray-500">Searching...</div>}

          {!isLoading && searchQuery.length < 2 && (
            <div className="text-center py-8 text-gray-500">
              Type at least 2 characters to search
            </div>
          )}

          {!isLoading && searchQuery.length >= 2 && results.length === 0 && (
            <div className="text-center py-8 text-gray-500">No items found</div>
          )}

          {!isLoading && results.length > 0 && (
            <div className="space-y-2">
              {results.map((result, index) => {
                const raw = result.item as unknown as Record<string, unknown>;
                const itemCost = Number(raw.cost) || 0;
                const itemWeight = Number(raw.weight) || 0;
                const itemFlavor = String(raw.flavor || raw.description || '');
                const affordable = canAfford(itemCost);
                const shortfall =
                  character && itemCost > 0 && character.eurobucks < itemCost
                    ? itemCost - character.eurobucks
                    : 0;

                const detailParts: string[] = [result.type.toUpperCase()];
                if (result.type === 'weapon') {
                  const w = result.item as DataWeapon;
                  detailParts.push(`DMG: ${w.damage}`, w.weapon_type);
                  if (w.ap) detailParts.push('AP');
                } else if (result.type === 'armor') {
                  const a = result.item as DataArmor;
                  if (a.encumbrance) detailParts.push(`EV: ${a.encumbrance}`);
                } else if (result.type === 'cyberware') {
                  const c = result.item as DataCyberware;
                  detailParts.push(`HL: ${c.humanity_loss || '?'}`);
                }

                return (
                  <div
                    key={`${result.type}-${raw.id}-${index}`}
                    className="border-2 border-black p-3 flex items-start gap-3"
                  >
                    <div className="w-12 h-12 bg-gray-200 border-2 border-black flex-shrink-0" />

                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-lg">{String(raw.name)}</h3>
                          <p className="text-xs text-gray-600">{detailParts.join(' • ')}</p>
                        </div>
                        <div className="text-right">
                          <div
                            className={`font-bold ${affordable || itemCost === 0 ? '' : 'text-red-600'}`}
                            title={
                              itemCost === 0
                                ? 'No cost listed'
                                : affordable
                                  ? 'You can afford this'
                                  : `Need €${shortfall.toLocaleString()} more`
                            }
                          >
                            €{itemCost.toLocaleString()}
                          </div>
                          {!affordable && itemCost > 0 && character && (
                            <div className="text-xs text-red-600 font-bold" title="Not enough eurobucks">
                              Short €{shortfall.toLocaleString()}
                            </div>
                          )}
                          {itemWeight > 0 && (
                            <div className="text-xs text-gray-600">{itemWeight}kg</div>
                          )}
                        </div>
                      </div>

                      {itemFlavor && (
                        <p className="text-sm mt-1 text-gray-700 line-clamp-2">{itemFlavor}</p>
                      )}

                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleAddItem(result, true)}
                          className={`flex-1 px-4 py-1 border-2 border-black font-bold uppercase text-sm ${
                            affordable || itemCost === 0
                              ? 'bg-blue-500 hover:bg-blue-600 text-white'
                              : 'bg-gray-200 text-red-700 hover:bg-red-100'
                          }`}
                          title={
                            affordable || itemCost === 0
                              ? 'Buy and add to inventory'
                              : 'Click to see why you cannot afford this'
                          }
                        >
                          {itemCost === 0
                            ? 'Add (€0)'
                            : affordable
                              ? `Purchase €${itemCost.toLocaleString()}`
                              : `Cannot afford (short €${shortfall.toLocaleString()})`}
                        </button>

                        <button
                          onClick={() => handleAddItem(result, false)}
                          className="px-4 py-1 border-2 border-black font-bold uppercase text-sm bg-green-500 hover:bg-green-600 text-white"
                        >
                          Free Add
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
