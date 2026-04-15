'use client';

import { useState } from 'react';
import { Character, Cyberware } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { ItemBrowser } from '../ItemBrowser';

interface CyberwareTabProps {
  character: Character;
  editable: boolean;
}

export function CyberwareTab({ character, editable }: CyberwareTabProps) {
  const [showItemBrowser, setShowItemBrowser] = useState(false);
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const removeItem = useGameStore((state) => state.removeItem);
  const sellItem = useGameStore((state) => state.sellItem);

  const cyberware = character.items.filter((item): item is Cyberware => item.type === 'cyberware');

  const totalCost = cyberware.reduce((sum, item) => sum + item.cost, 0);
  const totalHumanityLoss = cyberware
    .filter((item) => item.equipped)
    .reduce((sum, item) => sum + (item.humanityLoss || 0), 0);

  const handleToggleInstall = (itemId: string) => {
    if (!editable) return;
    const updatedItems = character.items.map((i) =>
      i.id === itemId ? { ...i, equipped: !i.equipped } : i,
    );
    updateCharacterField(character.id, 'items', updatedItems);
  };

  const handleRemoveCyberware = (itemId: string) => {
    if (!editable) return;
    removeItem(character.id, itemId);
  };

  // Group by cyberwareType
  const groupedCyberware = cyberware.reduce(
    (acc, item) => {
      const type = item.cyberwareType || 'Other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    },
    {} as Record<string, Cyberware[]>,
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border-2 border-black p-3">
            <label className="font-bold uppercase text-sm block mb-1">Installed</label>
            <div className="text-2xl font-bold">
              {cyberware.filter((c) => c.equipped).length}/{cyberware.length}
            </div>
          </div>

          <div className="border-2 border-black p-3">
            <label className="font-bold uppercase text-sm block mb-1">Total Value</label>
            <div className="text-2xl font-bold">€{totalCost.toLocaleString()}</div>
          </div>

          <div className="border-2 border-black p-3 bg-red-50">
            <label className="font-bold uppercase text-sm block mb-1">Humanity Loss</label>
            <div className="text-2xl font-bold text-red-600">{totalHumanityLoss}</div>
            <div className="text-xs text-gray-600">
              Humanity: {character.derivedStats?.humanity ?? '?'} / Current EMP:{' '}
              {character.derivedStats?.currentEmp ?? '?'}
            </div>
          </div>
        </div>

        {/* Cyberware List */}
        <section>
          <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
            Installed Cyberware
          </h2>

          {cyberware.length === 0 ? (
            <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-300">
              {editable ? (
                <div>
                  <p className="mb-3">No cyberware installed</p>
                  <button
                    onClick={() => setShowItemBrowser(true)}
                    className="bg-green-500 hover:bg-green-600 text-white border-2 border-black px-4 py-2 font-bold uppercase"
                  >
                    Browse Cyberware
                  </button>
                </div>
              ) : (
                'No cyberware installed'
              )}
            </div>
          ) : (
            <>
              {editable && (
                <button
                  onClick={() => setShowItemBrowser(true)}
                  className="w-full mb-2 bg-green-500 hover:bg-green-600 text-white border-2 border-black p-2 font-bold uppercase"
                >
                  + Add Cyberware
                </button>
              )}

              {Object.entries(groupedCyberware).map(([type, items]) => (
                <div key={type} className="mb-3">
                  <div className="text-sm font-bold uppercase text-gray-600 mb-1 border-b border-gray-300">
                    {type}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex flex-col gap-2 border-2 p-2 ${
                          item.equipped ? 'border-green-600 bg-green-50' : 'border-black'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-200 border border-black flex-shrink-0" />
                          <div className="flex-grow">
                            <div className="font-bold text-sm">{item.name}</div>
                            <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0">
                              <span title="Average HL from dice (CP2020 rolls at install; data is often dice-only).">
                                HL: {item.humanityLoss ?? 0}
                                {item.humanityCost && item.humanityCost !== '0' && (
                                  <span className="text-gray-500"> ({item.humanityCost})</span>
                                )}
                              </span>
                              <span>Surg: {item.surgCode || '?'}</span>
                              <span>€{item.cost.toLocaleString()}</span>
                            </div>
                          </div>
                          {item.equipped && (
                            <span className="text-xs font-bold text-green-600 uppercase">
                              Active
                            </span>
                          )}
                        </div>

                        {item.flavor && (
                          <div className="text-xs text-gray-500 italic">{item.flavor}</div>
                        )}

                        {editable && (
                          <div className="flex gap-1 flex-wrap">
                            <button
                              onClick={() => handleToggleInstall(item.id)}
                              className={`flex-1 border-2 border-black px-2 py-1 text-xs font-bold uppercase ${
                                item.equipped
                                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                  : 'bg-green-500 hover:bg-green-600 text-white'
                              }`}
                            >
                              {item.equipped ? 'Uninstall' : 'Install'}
                            </button>
                            <button
                              type="button"
                              onClick={() => sellItem(character.id, item.id)}
                              className="border-2 border-amber-600 px-2 py-1 text-xs font-bold uppercase text-amber-800 hover:bg-amber-100"
                              title={`Sell for 50% list (€${Math.floor(item.cost * 0.5).toLocaleString()})`}
                            >
                              Sell
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveCyberware(item.id)}
                              className="border-2 border-black px-2 py-1 text-xs font-bold hover:bg-red-600 hover:text-white"
                              title="Remove with no payment"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
