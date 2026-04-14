'use client';

import { useState } from 'react';
import { Character } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { ItemBrowser } from '../ItemBrowser';

interface GearTabProps {
  character: Character;
  editable: boolean;
}

export function GearTab({ character, editable }: GearTabProps) {
  const [showItemBrowser, setShowItemBrowser] = useState(false);
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const removeItem = useGameStore((state) => state.removeItem);

  const handleEurobucksChange = (value: number) => {
    if (!editable) return;
    updateCharacterField(character.id, 'eurobucks', Math.max(0, value));
  };

  const totalWeight = character.items.reduce((sum, item) => sum + (item.weight || 0), 0);
  const carryCapacity = character.derivedStats?.carry || 0;
  const isOverloaded = totalWeight > carryCapacity && carryCapacity > 0;

  // Misc items (not weapons, armor, cyberware, or programs)
  const gearItems = character.items.filter(
    (item) =>
      item.type !== 'weapon' &&
      item.type !== 'armor' &&
      item.type !== 'cyberware' &&
      item.type !== 'program',
  );

  // Vehicles
  const vehicles = character.items.filter((item) => item.type === 'vehicle');
  const miscItems = gearItems.filter((item) => item.type !== 'vehicle');

  const handleRemoveItem = (itemId: string) => {
    if (!editable) return;
    removeItem(character.id, itemId);
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Eurobucks and Weight */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border-2 border-black p-3">
            <label className="font-bold uppercase text-sm block mb-1">Eurobucks</label>
            {editable ? (
              <input
                type="number"
                value={character.eurobucks}
                onChange={(e) => handleEurobucksChange(parseInt(e.target.value) || 0)}
                className="w-full text-2xl font-bold border-2 border-gray-400 px-2 py-1"
              />
            ) : (
              <div className="text-2xl font-bold">€{character.eurobucks.toLocaleString()}</div>
            )}
          </div>

          <div
            className={`border-2 p-3 ${
              isOverloaded ? 'border-red-600 bg-red-50' : 'border-black bg-gray-100'
            }`}
          >
            <label className="font-bold uppercase text-sm block mb-1">Weight</label>
            <div className={`text-2xl font-bold ${isOverloaded ? 'text-red-600' : ''}`}>
              {totalWeight.toFixed(1)} kg
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Carry: {carryCapacity} kg / Lift: {character.derivedStats?.lift || 0} kg
            </div>
            {isOverloaded && (
              <div className="text-xs text-red-600 font-bold mt-1">OVERLOADED</div>
            )}
          </div>
        </div>

        {/* Vehicles */}
        {vehicles.length > 0 && (
          <section>
            <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
              Vehicles
            </h2>
            <div className="space-y-2">
              {vehicles.map((item) => {
                const v = item as unknown as Record<string, unknown>;
                return (
                  <div key={item.id} className="border-2 border-black p-3 flex items-start gap-3">
                    <div className="w-12 h-12 bg-gray-200 border border-black flex-shrink-0" />
                    <div className="flex-grow">
                      <div className="font-bold">{item.name}</div>
                      <div className="text-xs text-gray-600 flex gap-3">
                        {v['vehicleType'] ? <span>{String(v['vehicleType'])}</span> : null}
                        {v['topSpeed'] ? <span>Speed: {String(v['topSpeed'])}</span> : null}
                        {v['vehicleArmor'] ? <span>Armor: {String(v['vehicleArmor'])}</span> : null}
                        {v['vehicleSdp'] ? <span>SDP: {String(v['vehicleSdp'])}</span> : null}
                      </div>
                      {item.flavor && (
                        <div className="text-xs text-gray-500 mt-1">{item.flavor}</div>
                      )}
                    </div>
                    {editable && (
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-xl font-bold hover:text-red-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* General Gear */}
        <section>
          <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
            Gear & Equipment
          </h2>

          {miscItems.length === 0 ? (
            <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-300">
              {editable ? (
                <div>
                  <p className="mb-3">No gear items</p>
                  <button
                    onClick={() => setShowItemBrowser(true)}
                    className="bg-green-500 hover:bg-green-600 text-white border-2 border-black px-4 py-2 font-bold uppercase"
                  >
                    Browse Items
                  </button>
                </div>
              ) : (
                'No gear items'
              )}
            </div>
          ) : (
            <>
              {editable && (
                <button
                  onClick={() => setShowItemBrowser(true)}
                  className="w-full mb-2 bg-green-500 hover:bg-green-600 text-white border-2 border-black p-2 font-bold uppercase"
                >
                  + Add Items
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {miscItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 border-2 border-black p-2 hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 bg-gray-200 border border-black flex-shrink-0" />
                    <div className="flex-grow">
                      <div className="font-bold text-sm">{item.name}</div>
                      <div className="text-xs text-gray-600">
                        {item.type} • {item.weight}kg • €{item.cost}
                      </div>
                    </div>
                    {editable && (
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-xl font-bold hover:text-red-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {showItemBrowser && (
        <ItemBrowser characterId={character.id} onClose={() => setShowItemBrowser(false)} />
      )}
    </>
  );
}
