'use client';

import React, { useState } from 'react';
import { Character, Skill, Stats } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import {
  masterSkillList,
  SkillDefinition,
  formatKnowLanguageSkill,
  KNOW_LANGUAGE_SKILL_PREFIX,
} from '@/lib/game-logic/lookups';

function newSkillId(): string {
  return `skill-${crypto.randomUUID()}`;
}

interface SkillsTabProps {
  character: Character;
  editable: boolean;
}

export function SkillsTab({ character, editable }: SkillsTabProps) {
  const openDiceRoller = useGameStore((state) => state.openDiceRoller);
  const addSkill = useGameStore((state) => state.addSkill);
  const updateSkill = useGameStore((state) => state.updateSkill);
  const removeSkill = useGameStore((state) => state.removeSkill);
  const includeSpecialAbilityInRolls = useGameStore(
    (state) => state.ui.includeSpecialAbilityInSkillRolls,
  );
  const setIncludeSpecialAbilityInRolls = useGameStore(
    (state) => state.setIncludeSpecialAbilityInSkillRolls,
  );

  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'category' | 'value'>('category');
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [addSkillSearch, setAddSkillSearch] = useState('');
  const [knowLanguageLabel, setKnowLanguageLabel] = useState('');

  const saBonus = character.specialAbility?.value ?? 0;

  const handleRollSkill = (skill: Skill) => {
    const statTotal = character.stats[skill.linkedStat]?.total || 0;
    const totalValue = skill.value + statTotal;
    const withSA =
      includeSpecialAbilityInRolls && character.specialAbility ? totalValue + saBonus : totalValue;
    openDiceRoller(`1d10+${withSA}`);
  };

  // Filter and sort skills
  const filteredSkills = character.skills.filter((skill) =>
    skill.name.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  if (sortBy === 'name') {
    filteredSkills.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'category') {
    filteredSkills.sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  } else {
    filteredSkills.sort((a, b) => b.value - a.value);
  }

  // Group by category
  const skillsByCategory =
    sortBy === 'category'
      ? filteredSkills.reduce(
          (acc, skill) => {
            if (!acc[skill.category]) acc[skill.category] = [];
            acc[skill.category].push(skill);
            return acc;
          },
          {} as Record<string, Skill[]>,
        )
      : { 'All Skills': filteredSkills };

  // Skills available to add (not already on character)
  const existingSkillNames = new Set(character.skills.map((s) => s.name.toLowerCase()));
  const availableSkills = masterSkillList.filter(
    (s) =>
      !existingSkillNames.has(s.name.toLowerCase()) &&
      s.name.toLowerCase().includes(addSkillSearch.toLowerCase()),
  );

  const handleAddSkill = (def: SkillDefinition) => {
    const newSkill: Skill = {
      id: newSkillId(),
      name: def.name,
      value: 0,
      linkedStat: def.linkedStat as keyof Stats,
      category: def.category,
      isChipped: false,
    };
    addSkill(character.id, newSkill);
  };

  const handleAddCustomSkill = () => {
    if (!addSkillSearch.trim()) return;
    const raw = addSkillSearch.trim();
    const newSkill: Skill = {
      id: newSkillId(),
      name: raw,
      value: 0,
      linkedStat: 'int',
      category:
        raw.toLowerCase().startsWith(KNOW_LANGUAGE_SKILL_PREFIX.toLowerCase()) ? 'INT' : 'Custom',
      isChipped: false,
    };
    addSkill(character.id, newSkill);
    setAddSkillSearch('');
  };

  const handleAddKnowLanguage = () => {
    let name: string;
    try {
      name = formatKnowLanguageSkill(knowLanguageLabel);
    } catch {
      return;
    }
    if (existingSkillNames.has(name.toLowerCase())) return;
    addSkill(character.id, {
      id: newSkillId(),
      name,
      value: 0,
      linkedStat: 'int',
      category: 'INT',
      isChipped: false,
    });
    setKnowLanguageLabel('');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Special Ability */}
      {character.specialAbility && (
        <div className="border-2 border-yellow-600 bg-yellow-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase text-yellow-700">
                Special Ability ({character.role})
              </span>
              <div className="font-bold text-lg">{character.specialAbility.name}</div>
            </div>
            <div className="flex items-center gap-2">
              {editable ? (
                <input
                  type="number"
                  value={character.specialAbility.value}
                  onChange={(e) =>
                    useGameStore
                      .getState()
                      .updateCharacterField(
                        character.id,
                        'specialAbility.value',
                        Math.max(0, Math.min(10, parseInt(e.target.value) || 0)),
                      )
                  }
                  className="w-16 border-2 border-yellow-600 px-2 py-1 text-center font-bold text-xl"
                  min="0"
                  max="10"
                />
              ) : (
                <span className="text-2xl font-bold">{character.specialAbility.value}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search and Sort */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-grow relative min-w-[200px]">
          <input
            type="text"
            placeholder="Search skills..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full border-2 border-black px-3 py-2 pr-8"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xl font-bold"
            >
              ×
            </button>
          )}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'category' | 'value')}
          className="border-2 border-black px-3 py-2 font-bold"
        >
          <option value="category">By Category</option>
          <option value="name">By Name</option>
          <option value="value">By Value</option>
        </select>

        {character.specialAbility && (
          <label className="flex items-center gap-2 border-2 border-yellow-600 bg-yellow-50 px-3 py-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeSpecialAbilityInRolls}
              onChange={(e) => setIncludeSpecialAbilityInRolls(e.target.checked)}
              className="h-4 w-4 border-2 border-black accent-black"
            />
            <span className="text-xs font-bold uppercase text-yellow-900 whitespace-nowrap">
              Roll + {character.specialAbility.name} (+{saBonus})
            </span>
          </label>
        )}

        {editable && (
          <button
            onClick={() => setShowAddSkill(!showAddSkill)}
            className="border-2 border-black px-3 py-2 font-bold uppercase hover:bg-gray-100"
          >
            {showAddSkill ? '× Close' : '+ Add'}
          </button>
        )}
      </div>

      {/* Add Skill Panel */}
      {showAddSkill && editable && (
        <div className="border-2 border-green-600 bg-green-50 p-3 space-y-3">
          <div className="font-bold uppercase text-sm">Add Skill from Master List</div>
          <input
            type="text"
            placeholder="Search skills to add..."
            value={addSkillSearch}
            onChange={(e) => setAddSkillSearch(e.target.value)}
            className="w-full border border-black px-2 py-1"
          />
          <div className="max-h-40 overflow-y-auto space-y-1">
            {availableSkills.slice(0, 20).map((def) => (
              <button
                key={def.name}
                onClick={() => handleAddSkill(def)}
                className="w-full text-left border border-black px-2 py-1 text-sm hover:bg-green-100 flex justify-between"
              >
                <span className="font-bold">{def.name}</span>
                <span className="text-xs text-gray-600">
                  {def.linkedStat.toUpperCase()} / {def.category}
                </span>
              </button>
            ))}
            {availableSkills.length === 0 && addSkillSearch && (
              <button
                onClick={handleAddCustomSkill}
                className="w-full text-left border-2 border-dashed border-green-600 px-2 py-1 text-sm hover:bg-green-100"
              >
                + Create custom skill: <span className="font-bold">{addSkillSearch}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-green-300 pt-2">
            <span className="text-xs font-bold uppercase text-green-800 whitespace-nowrap">+ Language:</span>
            <input
              type="text"
              placeholder="e.g. Japanese, Spanish…"
              value={knowLanguageLabel}
              onChange={(e) => setKnowLanguageLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddKnowLanguage(); }}
              className="flex-1 min-w-[120px] border border-green-400 px-2 py-0.5 text-sm"
            />
            <button
              type="button"
              onClick={handleAddKnowLanguage}
              disabled={!knowLanguageLabel.trim()}
              className="border border-green-600 px-2 py-0.5 text-xs font-bold uppercase bg-white hover:bg-green-100 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Skills List */}
      {Object.keys(skillsByCategory).length === 0 ? (
        <div className="text-center text-gray-500 py-8">No skills found</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(skillsByCategory).map(([category, skills]) => (
            <React.Fragment key={category}>
              {sortBy === 'category' && skills.length > 0 && (
                <div className="col-span-2 font-bold uppercase text-sm mt-2 border-b-2 border-black pb-1">
                  {category}
                </div>
              )}
              {skills.map((skill) => {
                const statTotal = character.stats[skill.linkedStat]?.total || 0;
                const totalValue = skill.value + statTotal;
                const rollTotal =
                  includeSpecialAbilityInRolls && character.specialAbility
                    ? totalValue + saBonus
                    : totalValue;

                return (
                  <div
                    key={skill.id}
                    className={`flex items-center justify-between border-2 p-2 transition-colors ${
                      skill.isChipped
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-black hover:bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => handleRollSkill(skill)}
                      className="flex-grow text-left"
                    >
                      <div className="font-bold flex items-center gap-1">
                        {skill.name}
                        {skill.isChipped && (
                          <span className="text-xs text-blue-600" title="Chipped skill">
                            [CH]
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        {skill.linkedStat.toUpperCase()}: {skill.value} + {statTotal} = {totalValue}
                        {includeSpecialAbilityInRolls && character.specialAbility && (
                          <span className="text-yellow-800 font-semibold">
                            {' '}
                            + {character.specialAbility.name} {saBonus} → roll 1d10+{rollTotal}
                          </span>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-1">
                      {editable ? (
                        <>
                          <input
                            type="number"
                            value={skill.value}
                            onChange={(e) =>
                              updateSkill(character.id, skill.id, {
                                value: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)),
                              })
                            }
                            className="w-12 border border-gray-400 px-1 py-0.5 text-center font-bold"
                            min="0"
                            max="10"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateSkill(character.id, skill.id, {
                                isChipped: !skill.isChipped,
                              });
                            }}
                            className={`text-xs px-1 py-0.5 border ${
                              skill.isChipped
                                ? 'border-blue-600 bg-blue-100 text-blue-600'
                                : 'border-gray-400 text-gray-400 hover:text-blue-600'
                            }`}
                            title="Toggle chipped"
                          >
                            CH
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSkill(character.id, skill.id);
                            }}
                            className="text-gray-400 hover:text-red-600 font-bold"
                            title="Remove skill"
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <span className="text-xl font-bold ml-2">{rollTotal}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
