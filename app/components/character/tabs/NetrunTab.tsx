'use client';

import { useState } from 'react';
import { Character, NetrunDeck, Program } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { sheetRollContext } from '@/lib/dice-roll-send-to-gm';
import { ItemBrowser } from '../ItemBrowser';

interface NetrunTabProps {
  character: Character;
  editable: boolean;
}

const DEFAULT_DECK: NetrunDeck = {
  model: '',
  cpu: 0,
  speed: 0,
  dataWall: 0,
  strength: 0,
  ramMax: 0,
  ramUsed: 0,
};

const DECK_STATS: Array<{ key: keyof NetrunDeck; label: string }> = [
  { key: 'cpu', label: 'CPU' },
  { key: 'speed', label: 'Speed' },
  { key: 'dataWall', label: 'Data Wall' },
  { key: 'strength', label: 'Strength' },
];

export function NetrunTab({ character, editable }: NetrunTabProps) {
  const [showItemBrowser, setShowItemBrowser] = useState(false);
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const removeItem = useGameStore((state) => state.removeItem);
  const openDiceRoller = useGameStore((state) => state.openDiceRoller);
  const sessionId = useGameStore((state) => state.session.id);

  const deck: NetrunDeck = character.netrunDeck || DEFAULT_DECK;
  const programs = character.items.filter((item): item is Program => item.type === 'program');
  const interfaceSkill = character.skills.find(
    (s) => s.name.toLowerCase() === 'interface',
  );

  const loadedPrograms = programs.filter((p) => p.equipped);
  const totalMU = loadedPrograms.reduce((sum, p) => sum + (p.muCost || 0), 0);

  const handleToggleProgram = (programId: string) => {
    if (!editable) return;
    const updatedItems = character.items.map((i) =>
      i.id === programId ? { ...i, equipped: !i.equipped } : i,
    );
    updateCharacterField(character.id, 'items', updatedItems);
  };

  const handleRemoveProgram = (programId: string) => {
    if (!editable) return;
    removeItem(character.id, programId);
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Deck Info */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border-2 border-black p-3">
            <label className="font-bold uppercase text-sm block mb-1">Deck Model</label>
            {editable ? (
              <input
                type="text"
                value={deck.model}
                onChange={(e) =>
                  updateCharacterField(character.id, 'netrunDeck.model', e.target.value)
                }
                className="w-full border border-gray-400 px-2 py-1"
                placeholder="Cyberdeck name"
              />
            ) : (
              <div className="font-bold">{deck.model || 'None'}</div>
            )}
          </div>

          <div className="border-2 border-black p-3 bg-blue-50">
            <label className="font-bold uppercase text-sm block mb-1">Interface</label>
            <button
              onClick={() =>
                interfaceSkill &&
                openDiceRoller(`1d10+${interfaceSkill.value + (character.stats.int.total || 0)}`, {
                  kind: 'custom',
                  characterId: character.id,
                  ...sheetRollContext(character, sessionId, 'Interface (netrun)'),
                })
              }
              className="w-full text-2xl font-bold hover:bg-blue-100 cursor-pointer"
            >
              {interfaceSkill?.value || 0}
            </button>
          </div>

          <div className="border-2 border-black p-3">
            <label className="font-bold uppercase text-sm block mb-1">RAM</label>
            <div className="text-lg font-bold">
              <span className={totalMU > deck.ramMax ? 'text-red-600' : ''}>
                {totalMU}
              </span>{' '}
              / {deck.ramMax}
              {editable && (
                <input
                  type="number"
                  value={deck.ramMax}
                  onChange={(e) =>
                    updateCharacterField(
                      character.id,
                      'netrunDeck.ramMax',
                      parseInt(e.target.value) || 0,
                    )
                  }
                  className="w-16 ml-2 border border-gray-400 px-1 py-0.5 text-center text-sm"
                  min="0"
                />
              )}
            </div>
          </div>
        </div>

        {/* Deck Stats */}
        <div className="grid grid-cols-4 gap-2">
          {DECK_STATS.map(({ key, label }) => (
            <div key={key} className="border-2 border-black p-2">
              <label className="font-bold uppercase text-xs block mb-1">{label}</label>
              {editable ? (
                <input
                  type="number"
                  value={deck[key] as number}
                  onChange={(e) =>
                    updateCharacterField(
                      character.id,
                      `netrunDeck.${key}`,
                      parseInt(e.target.value) || 0,
                    )
                  }
                  className="w-full text-center border border-gray-400 px-1 py-1"
                />
              ) : (
                <div className="text-center font-bold">{deck[key] as number}</div>
              )}
            </div>
          ))}
        </div>

        {/* Programs */}
        <section>
          <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
            Programs
          </h2>

          {programs.length === 0 ? (
            <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-300">
              {editable ? (
                <div>
                  <p className="mb-3">No programs installed</p>
                  <button
                    onClick={() => setShowItemBrowser(true)}
                    className="bg-blue-500 hover:bg-blue-600 text-white border-2 border-black px-4 py-2 font-bold uppercase"
                  >
                    Browse Programs
                  </button>
                </div>
              ) : (
                'No programs installed'
              )}
            </div>
          ) : (
            <>
              {editable && (
                <button
                  onClick={() => setShowItemBrowser(true)}
                  className="w-full mb-2 bg-blue-500 hover:bg-blue-600 text-white border-2 border-black p-2 font-bold uppercase"
                >
                  + Add Programs
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {programs.map((program) => (
                  <div
                    key={program.id}
                    className={`flex flex-col gap-2 border-2 p-2 ${
                      program.equipped ? 'border-blue-600 bg-blue-50' : 'border-black'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-200 border border-black flex-shrink-0" />
                      <div className="flex-grow">
                        <div className="font-bold">{program.name}</div>
                        <div className="text-xs text-gray-600">
                          {program.programType || 'Program'} • MU: {program.muCost || 0}
                          {program.strength > 0 && ` • STR: ${program.strength}`}
                        </div>
                      </div>
                      {program.equipped && (
                        <span className="text-xs font-bold text-blue-600 uppercase">Loaded</span>
                      )}
                    </div>

                    {editable && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleToggleProgram(program.id)}
                          className={`flex-1 border-2 border-black px-2 py-1 text-xs font-bold uppercase ${
                            program.equipped
                              ? 'bg-orange-500 hover:bg-orange-600 text-white'
                              : 'bg-blue-500 hover:bg-blue-600 text-white'
                          }`}
                        >
                          {program.equipped ? 'Unload' : 'Load'}
                        </button>
                        <button
                          onClick={() => handleRemoveProgram(program.id)}
                          className="border-2 border-black px-2 py-1 text-xs font-bold hover:bg-red-600 hover:text-white"
                        >
                          ×
                        </button>
                      </div>
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
