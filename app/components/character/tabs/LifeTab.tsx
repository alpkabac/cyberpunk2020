'use client';

import React, { useState } from 'react';
import { Character, Lifepath, LifeEvent } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';

interface LifeTabProps {
  character: Character;
  editable: boolean;
}

function ensureLifepath(character: Character): Lifepath {
  return (
    character.lifepath || {
      style: { clothes: '', hair: '', affectations: '' },
      ethnicity: '',
      language: '',
      familyBackground: '',
      siblings: '',
      motivations: {
        traits: '',
        valuedPerson: '',
        valueMost: '',
        feelAboutPeople: '',
        valuedPossession: '',
      },
      lifeEvents: [],
      notes: '',
    }
  );
}

export function LifeTab({ character, editable }: LifeTabProps) {
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const lifepath = ensureLifepath(character);
  const [showAddEvent, setShowAddEvent] = useState(false);

  const updateField = (path: string, value: unknown) => {
    if (!editable) return;
    updateCharacterField(character.id, `lifepath.${path}`, value);
  };

  const addLifeEvent = () => {
    const nextAge = lifepath.lifeEvents.length > 0
      ? Math.max(...lifepath.lifeEvents.map((e) => e.age)) + 1
      : Math.max(16, character.age - 5);

    const newEvents = [
      ...lifepath.lifeEvents,
      { age: nextAge, event: '' },
    ];
    updateField('lifeEvents', newEvents);
    setShowAddEvent(false);
  };

  const updateEvent = (index: number, field: keyof LifeEvent, value: string | number) => {
    const newEvents = [...lifepath.lifeEvents];
    newEvents[index] = { ...newEvents[index], [field]: value };
    updateField('lifeEvents', newEvents);
  };

  const removeEvent = (index: number) => {
    const newEvents = lifepath.lifeEvents.filter((_, i) => i !== index);
    updateField('lifeEvents', newEvents);
  };

  const InputField = ({
    label,
    value,
    path,
    placeholder,
  }: {
    label: string;
    value: string;
    path: string;
    placeholder?: string;
  }) => (
    <div className="flex flex-col gap-1">
      <label className="font-bold uppercase text-xs">{label}</label>
      {editable ? (
        <input
          type="text"
          value={value}
          onChange={(e) => updateField(path, e.target.value)}
          className="border border-black px-2 py-1 text-sm"
          placeholder={placeholder}
        />
      ) : (
        <span className="text-sm">{value || <span className="text-gray-400 italic">—</span>}</span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Style */}
      <section>
        <h2 className="text-xl font-bold uppercase border-b-2 border-black pb-1 mb-3">Style</h2>
        <div className="grid grid-cols-3 gap-3">
          <InputField label="Clothes" value={lifepath.style.clothes} path="style.clothes" placeholder="e.g. Leisurewear" />
          <InputField label="Hair" value={lifepath.style.hair} path="style.hair" placeholder="e.g. Mohawk" />
          <InputField label="Affectations" value={lifepath.style.affectations} path="style.affectations" placeholder="e.g. Mirrorshades" />
        </div>
      </section>

      {/* Background */}
      <section>
        <h2 className="text-xl font-bold uppercase border-b-2 border-black pb-1 mb-3">Background</h2>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Ethnicity" value={lifepath.ethnicity} path="ethnicity" placeholder="e.g. Anglo-American" />
          <InputField label="Language" value={lifepath.language} path="language" placeholder="e.g. English" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex flex-col gap-1">
            <label className="font-bold uppercase text-xs">Family Background</label>
            {editable ? (
              <textarea
                value={lifepath.familyBackground}
                onChange={(e) => updateField('familyBackground', e.target.value)}
                className="border border-black px-2 py-1 text-sm h-20 resize-none"
                placeholder="Corporate Execs, Nomad Pack, Combat Zone family..."
              />
            ) : (
              <span className="text-sm">
                {lifepath.familyBackground || <span className="text-gray-400 italic">—</span>}
              </span>
            )}
          </div>
          <InputField label="Siblings" value={lifepath.siblings} path="siblings" placeholder="e.g. 2 brothers, 1 sister" />
        </div>
      </section>

      {/* Motivations */}
      <section>
        <h2 className="text-xl font-bold uppercase border-b-2 border-black pb-1 mb-3">Motivations</h2>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Personality Traits" value={lifepath.motivations.traits} path="motivations.traits" placeholder="e.g. Rebellious, Loyal" />
          <InputField label="Most Valued Person" value={lifepath.motivations.valuedPerson} path="motivations.valuedPerson" placeholder="e.g. A sibling, A lover" />
          <InputField label="What You Value Most" value={lifepath.motivations.valueMost} path="motivations.valueMost" placeholder="e.g. Honor, Money, Power" />
          <InputField label="How You Feel About People" value={lifepath.motivations.feelAboutPeople} path="motivations.feelAboutPeople" placeholder="e.g. People are tools" />
          <InputField label="Most Valued Possession" value={lifepath.motivations.valuedPossession} path="motivations.valuedPossession" placeholder="e.g. A weapon, A photo" />
        </div>
      </section>

      {/* Life Events */}
      <section>
        <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-3">
          <h2 className="text-xl font-bold uppercase">Life Events</h2>
          {editable && (
            <button
              onClick={addLifeEvent}
              className="border-2 border-black px-3 py-1 text-sm font-bold uppercase hover:bg-gray-100"
            >
              + Add Event
            </button>
          )}
        </div>
        <p className="text-xs text-gray-600 mb-2">One event per year after age 16</p>

        {lifepath.lifeEvents.length === 0 ? (
          <div className="text-center text-gray-400 py-4 border-2 border-dashed border-gray-300">
            No life events recorded
          </div>
        ) : (
          <div className="space-y-2">
            {lifepath.lifeEvents.map((event, index) => (
              <div key={index} className="flex items-start gap-2 border-2 border-black p-2">
                <div className="flex-shrink-0">
                  {editable ? (
                    <input
                      type="number"
                      value={event.age}
                      onChange={(e) => updateEvent(index, 'age', parseInt(e.target.value) || 16)}
                      className="w-14 border border-gray-400 px-1 py-0.5 text-center font-bold"
                      min="16"
                    />
                  ) : (
                    <span className="font-bold text-lg w-14 inline-block text-center">
                      {event.age}
                    </span>
                  )}
                  <div className="text-xs text-center text-gray-500">Age</div>
                </div>

                <div className="flex-grow">
                  {editable ? (
                    <textarea
                      value={event.event}
                      onChange={(e) => updateEvent(index, 'event', e.target.value)}
                      className="w-full border border-gray-400 px-2 py-1 text-sm h-16 resize-none"
                      placeholder="What happened this year..."
                    />
                  ) : (
                    <span className="text-sm">
                      {event.event || <span className="text-gray-400 italic">—</span>}
                    </span>
                  )}
                </div>

                {editable && (
                  <button
                    onClick={() => removeEvent(index)}
                    className="text-gray-400 hover:text-red-600 font-bold text-xl flex-shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      <section>
        <h2 className="text-xl font-bold uppercase border-b-2 border-black pb-1 mb-3">
          Additional Notes
        </h2>
        {editable ? (
          <textarea
            value={lifepath.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className="w-full h-32 border-2 border-black p-3 font-mono resize-none text-sm"
            placeholder="Additional character notes, backstory details..."
          />
        ) : (
          <div className="w-full min-h-32 border-2 border-black p-3 whitespace-pre-wrap text-sm">
            {lifepath.notes || <span className="text-gray-400 italic">No additional notes</span>}
          </div>
        )}
      </section>
    </div>
  );
}
