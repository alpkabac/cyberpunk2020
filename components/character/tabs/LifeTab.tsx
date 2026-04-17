'use client';

import React from 'react';
import { Character, Lifepath, LifeEvent } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import {
  LIFEPATH_CLOTHES,
  LIFEPATH_HAIR,
  LIFEPATH_AFFECTATIONS,
  LIFEPATH_ETHNICITY,
  LIFEPATH_LANGUAGE,
  LIFEPATH_FAMILY_RANKING,
  LIFEPATH_CHILDHOOD,
  LIFEPATH_SIBLINGS_PRESET,
  LIFEPATH_TRAITS,
  LIFEPATH_VALUED_PERSON,
  LIFEPATH_VALUE_MOST,
  LIFEPATH_FEEL_ABOUT_PEOPLE,
  LIFEPATH_VALUED_POSSESSION,
} from '@/lib/data/lifepath-options';

/** Same id = allies on the tactical map; GM uses this with cover hints and LOS. */
const TEAM_PRESETS = ['party', 'hostile', 'neutral', 'ally', 'police', 'corp'] as const;

interface LifeTabProps {
  character: Character;
  editable: boolean;
}

const EMPTY_LIFEPATH: Lifepath = {
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
};

/** Merge partial DB / JSON lifepath with defaults so nested fields are never undefined. */
function ensureLifepath(character: Character): Lifepath {
  const lp = character.lifepath;
  if (!lp) return { ...EMPTY_LIFEPATH };
  return {
    style: {
      clothes: lp.style?.clothes ?? '',
      hair: lp.style?.hair ?? '',
      affectations: lp.style?.affectations ?? '',
    },
    ethnicity: lp.ethnicity ?? '',
    language: lp.language ?? '',
    familyBackground: lp.familyBackground ?? '',
    siblings: lp.siblings ?? '',
    motivations: {
      traits: lp.motivations?.traits ?? '',
      valuedPerson: lp.motivations?.valuedPerson ?? '',
      valueMost: lp.motivations?.valueMost ?? '',
      feelAboutPeople: lp.motivations?.feelAboutPeople ?? '',
      valuedPossession: lp.motivations?.valuedPossession ?? '',
    },
    lifeEvents: Array.isArray(lp.lifeEvents) ? lp.lifeEvents : [],
    notes: lp.notes ?? '',
  };
}

/** CP2020 Lifepath: roll 1D10 per column or pick from list. */
function SelectOrCustom({
  label,
  tooltip,
  options,
  value,
  onChange,
  editable,
  placeholder,
}: {
  label: string;
  tooltip: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  placeholder?: string;
}) {
  const isPreset = options.includes(value);
  const selectVal = isPreset ? value : '__custom__';

  return (
    <div className="flex flex-col gap-1">
      <label
        className="font-bold uppercase text-xs cursor-help border-b border-dotted border-gray-400 w-fit max-w-full"
        title={tooltip}
      >
        {label}
      </label>
      {editable ? (
        <>
          <select
            value={selectVal}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__custom__') {
                if (options.includes(value)) onChange('');
              } else {
                onChange(v);
              }
            }}
            className="border border-black px-2 py-1 text-sm bg-white"
          >
            <option value="__custom__">— Custom —</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {(selectVal === '__custom__' || !isPreset) && (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="border border-black px-2 py-1 text-sm"
              placeholder={placeholder}
            />
          )}
        </>
      ) : (
        <span className="text-sm">
          {value || <span className="text-gray-400 italic">—</span>}
        </span>
      )}
    </div>
  );
}

function SectionTitle({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) {
  return (
    <h2
      className="text-xl font-bold uppercase border-b-2 border-black pb-1 mb-3 cursor-help"
      title={tooltip}
    >
      {children}
    </h2>
  );
}

export function LifeTab({ character, editable }: LifeTabProps) {
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const lifepath = ensureLifepath(character);
  const teamRaw = (character.team ?? '').trim();
  const defaultTeam = character.type === 'npc' ? 'hostile' : 'party';
  const teamEffective = teamRaw || defaultTeam;
  const teamSelectValue = TEAM_PRESETS.includes(teamEffective as (typeof TEAM_PRESETS)[number])
    ? teamEffective
    : '__custom__';

  const updateField = (path: string, value: unknown) => {
    if (!editable) return;
    updateCharacterField(character.id, `lifepath.${path}`, value);
  };

  const addLifeEvent = () => {
    const nextAge =
      lifepath.lifeEvents.length > 0
        ? Math.max(...lifepath.lifeEvents.map((e) => e.age)) + 1
        : Math.max(16, character.age - 5);

    const newEvents = [...lifepath.lifeEvents, { age: nextAge, event: '' }];
    updateField('lifeEvents', newEvents);
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

  return (
    <div className="flex flex-col gap-6">
      <p
        className="text-xs text-gray-600 border border-gray-300 p-2 bg-gray-50"
        title="Lifepath is from Cyberpunk 2020 (View from the Edge). Use presets from the book or your own ideas."
      >
        <strong>Lifepath</strong> defines look, roots, and what drives your character. Dropdowns list CP2020
        table options; pick <strong>Custom</strong> to type freely. Hover labels for rule reminders.
      </p>

      <section>
        <SectionTitle tooltip="Same team id = allies on the map. Different teams = enemies for AI cover suggestions and line-of-sight. Leave blank to use defaults: PCs party, NPCs hostile.">
          Tactical team
        </SectionTitle>
        <p className="text-xs text-gray-600 mb-2">
          Used for the battle map and AI GM: who shares a side, and who counts as hostile for cover and LOS hints.
          Empty sheet defaults to <strong>{defaultTeam}</strong> for this character type.
        </p>
        <div className="flex flex-col gap-2 max-w-md">
          {editable ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="font-bold uppercase text-xs">Preset or custom</label>
                <select
                  value={teamSelectValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') {
                      updateCharacterField(character.id, 'team', '');
                      return;
                    }
                    updateCharacterField(character.id, 'team', v);
                  }}
                  className="border border-black px-2 py-1 text-sm bg-white"
                >
                  <option value="__custom__">— Custom / blank (use default) —</option>
                  {TEAM_PRESETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {(teamSelectValue === '__custom__' || !TEAM_PRESETS.includes(teamEffective as (typeof TEAM_PRESETS)[number])) && (
                <div className="flex flex-col gap-1">
                  <label className="font-bold uppercase text-xs">Custom team id</label>
                  <input
                    type="text"
                    value={teamRaw}
                    onChange={(e) => updateCharacterField(character.id, 'team', e.target.value)}
                    className="border border-black px-2 py-1 text-sm"
                    placeholder={defaultTeam}
                  />
                </div>
              )}
            </>
          ) : (
            <span className="text-sm">
              <strong>{teamEffective}</strong>
              {!teamRaw && (
                <span className="text-gray-500 ml-1">(default for {character.type === 'npc' ? 'NPC' : 'PC'})</span>
              )}
            </span>
          )}
        </div>
      </section>

      {/* Style */}
      <section>
        <SectionTitle tooltip="CP2020: Dress & Personal Style — roll 1D10 per column (clothes, hair, affectations) or choose from the lists.">
          Style
        </SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SelectOrCustom
            label="Clothes"
            tooltip="What you wear on the Street. Fashion is action (CP2020 Lifepath, Dress & Personal Style)."
            options={LIFEPATH_CLOTHES}
            value={lifepath.style.clothes}
            onChange={(v) => updateField('style.clothes', v)}
            editable={editable}
            placeholder="e.g. Leisurewear, your own style…"
          />
          <SelectOrCustom
            label="Hair"
            tooltip="Hairstyle — part of your visual identity in Night City."
            options={LIFEPATH_HAIR}
            value={lifepath.style.hair}
            onChange={(v) => updateField('style.hair', v)}
            editable={editable}
            placeholder="Your hairstyle…"
          />
          <SelectOrCustom
            label="Affectations"
            tooltip="Quirks and accessories: scars, shades, rings, etc."
            options={LIFEPATH_AFFECTATIONS}
            value={lifepath.style.affectations}
            onChange={(v) => updateField('style.affectations', v)}
            editable={editable}
            placeholder="Your affectations…"
          />
        </div>
      </section>

      {/* Background */}
      <section>
        <SectionTitle tooltip="Ethnic origins and language — ties to culture and how you talk on the Street.">
          Background
        </SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectOrCustom
            label="Ethnicity"
            tooltip="Where you come from sets customs and allegiances. Native language is usually +8; everyone also knows streetslang (CP2020)."
            options={LIFEPATH_ETHNICITY}
            value={lifepath.ethnicity}
            onChange={(v) => updateField('ethnicity', v)}
            editable={editable}
            placeholder="Your background…"
          />
          <SelectOrCustom
            label="Language"
            tooltip="Primary language you speak best. Add other languages as skills if needed."
            options={LIFEPATH_LANGUAGE}
            value={lifepath.language}
            onChange={(v) => updateField('language', v)}
            editable={editable}
            placeholder="Primary language…"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="flex flex-col gap-1">
            <label
              className="font-bold uppercase text-xs cursor-help border-b border-dotted border-gray-400 w-fit"
              title="Who you are and where you came from: Family Ranking, Parents, Childhood, etc. Expand with your own story."
            >
              Family background
            </label>
            {editable ? (
              <>
                <select
                  className="border border-black px-2 py-1 text-sm bg-white mb-1"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) updateField('familyBackground', v);
                  }}
                  title="Insert a Family Ranking preset (CP2020). Edit the text below."
                >
                  <option value="">— Insert family ranking preset —</option>
                  {LIFEPATH_FAMILY_RANKING.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <select
                  className="border border-black px-2 py-1 text-sm bg-white mb-1"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                      const cur = lifepath.familyBackground;
                      updateField(
                        'familyBackground',
                        cur ? `${cur}\n\nChildhood: ${v}` : `Childhood environment: ${v}`,
                      );
                    }
                  }}
                  title="Append a Childhood Environment line (CP2020)."
                >
                  <option value="">— Append childhood environment —</option>
                  {LIFEPATH_CHILDHOOD.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <textarea
                  value={lifepath.familyBackground}
                  onChange={(e) => updateField('familyBackground', e.target.value)}
                  className="border border-black px-2 py-1 text-sm h-28 resize-y min-h-[7rem]"
                  placeholder="Corporate family, Nomad pack, Combat Zone, parents, tragedy, childhood…"
                  title="Full family story: use presets above or write your own."
                />
              </>
            ) : (
              <span className="text-sm whitespace-pre-wrap">
                {lifepath.familyBackground || <span className="text-gray-400 italic">—</span>}
              </span>
            )}
          </div>

          <SelectOrCustom
            label="Siblings"
            tooltip="CP2020: roll 1D10 for count (1–7 siblings, 8–10 only child), then detail each sibling."
            options={LIFEPATH_SIBLINGS_PRESET}
            value={lifepath.siblings}
            onChange={(v) => updateField('siblings', v)}
            editable={editable}
            placeholder="Names, ages, attitudes…"
          />
        </div>
      </section>

      {/* Motivations */}
      <section>
        <SectionTitle tooltip="CP2020 Motivations — what makes you tick? Choose or roll on each table.">
          Motivations
        </SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectOrCustom
            label="Personality traits"
            tooltip="Core personality — drives how you roleplay reactions and choices."
            options={LIFEPATH_TRAITS}
            value={lifepath.motivations.traits}
            onChange={(v) => updateField('motivations.traits', v)}
            editable={editable}
            placeholder="Traits…"
          />
          <SelectOrCustom
            label="Person you value most"
            tooltip="Who matters most when the chips are down?"
            options={LIFEPATH_VALUED_PERSON}
            value={lifepath.motivations.valuedPerson}
            onChange={(v) => updateField('motivations.valuedPerson', v)}
            editable={editable}
            placeholder="Name or role…"
          />
          <SelectOrCustom
            label="What you value most"
            tooltip="What you will not sell cheap — money, honor, friendship, etc."
            options={LIFEPATH_VALUE_MOST}
            value={lifepath.motivations.valueMost}
            onChange={(v) => updateField('motivations.valueMost', v)}
            editable={editable}
            placeholder="…"
          />
          <SelectOrCustom
            label="How you feel about people"
            tooltip="Default stance toward others — paranoia, optimism, exploitation, etc."
            options={LIFEPATH_FEEL_ABOUT_PEOPLE}
            value={lifepath.motivations.feelAboutPeople}
            onChange={(v) => updateField('motivations.feelAboutPeople', v)}
            editable={editable}
            placeholder="…"
          />
          <SelectOrCustom
            label="Most valued possession"
            tooltip="The one thing you would grab in a fire."
            options={LIFEPATH_VALUED_POSSESSION}
            value={lifepath.motivations.valuedPossession}
            onChange={(v) => updateField('motivations.valuedPossession', v)}
            editable={editable}
            placeholder="Describe it…"
          />
        </div>
      </section>

      {/* Life Events */}
      <section>
        <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-3">
          <h2
            className="text-xl font-bold uppercase cursor-help"
            title="CP2020: For each year after age 16, one major event (roll on Life Events tables in the book). Age + event here."
          >
            Life events
          </h2>
          {editable && (
            <button
              type="button"
              onClick={addLifeEvent}
              className="border-2 border-black px-3 py-1 text-sm font-bold uppercase hover:bg-gray-100"
              title="Add another year’s major event"
            >
              + Add event
            </button>
          )}
        </div>
        <p
          className="text-xs text-gray-600 mb-2"
          title="One row per year after 16: set age and what happened (gigs, romance, disaster, etc.)."
        >
          One event per year after age 16 (adjust age to match your character).
        </p>

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
                      onChange={(e) => updateEvent(index, 'age', parseInt(e.target.value, 10) || 16)}
                      className="w-14 border border-gray-400 px-1 py-0.5 text-center font-bold"
                      min={16}
                      title="Age in Night City when this event happened"
                    />
                  ) : (
                    <span className="font-bold text-lg w-14 inline-block text-center">{event.age}</span>
                  )}
                  <div className="text-xs text-center text-gray-500">Age</div>
                </div>

                <div className="flex-grow min-w-0">
                  {editable ? (
                    <textarea
                      value={event.event}
                      onChange={(e) => updateEvent(index, 'event', e.target.value)}
                      className="w-full border border-gray-400 px-2 py-1 text-sm h-16 resize-y"
                      placeholder="What happened this year…"
                      title="Major event for that year (use CP2020 Life Events tables or your own)."
                    />
                  ) : (
                    <span className="text-sm">
                      {event.event || <span className="text-gray-400 italic">—</span>}
                    </span>
                  )}
                </div>

                {editable && (
                  <button
                    type="button"
                    onClick={() => removeEvent(index)}
                    className="text-gray-400 hover:text-red-600 font-bold text-xl flex-shrink-0"
                    title="Remove this event"
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
        <h2
          className="text-xl font-bold uppercase border-b-2 border-black pb-1 mb-3 cursor-help"
          title="Anything else: contacts, enemies, debts, goals not covered above."
        >
          Additional notes
        </h2>
        {editable ? (
          <textarea
            value={lifepath.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className="w-full h-32 border-2 border-black p-3 font-mono resize-y min-h-[8rem] text-sm"
            placeholder="Contacts, enemies, debts, long-term goals…"
            title="Freeform notes for the GM and player."
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
