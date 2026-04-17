'use client';

import React, { useState } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { CharacterHeader } from './CharacterHeader';
import { SkillsTab } from './tabs/SkillsTab';
import { CombatTab } from './tabs/CombatTab';
import { BodyTab } from './tabs/BodyTab';
import { GearTab } from './tabs/GearTab';
import { CyberwareTab } from './tabs/CyberwareTab';
import { LifeTab } from './tabs/LifeTab';
import { NetrunTab } from './tabs/NetrunTab';

interface CharacterSheetProps {
  characterId: string;
  editable?: boolean;
}

type TabType = 'skills' | 'combat' | 'body' | 'gear' | 'cyberware' | 'life' | 'netrun';

export function CharacterSheet({ characterId, editable = false }: CharacterSheetProps) {
  const character = useGameStore(
    (state) => state.characters.byId[characterId] ?? state.npcs.byId[characterId],
  );
  const [activeTab, setActiveTab] = useState<TabType>('skills');

  if (!character) {
    return (
      <div className="p-4 text-center text-gray-400">
        Character not found
      </div>
    );
  }

  return (
    <div className="character-sheet bg-[#f5f5dc] text-black rounded-lg border-2 border-black shadow-xl max-w-[900px] mx-auto">
      <CharacterHeader character={character} editable={editable} />

      {/* Tab Navigation */}
      <nav className="flex border-b-2 border-black bg-[#e8e8d0]">
        {[
          { id: 'skills', label: 'Skills' },
          { id: 'combat', label: 'Combat' },
          { id: 'body', label: 'Body' },
          { id: 'gear', label: 'Gear' },
          { id: 'cyberware', label: 'Cyberware' },
          { id: 'life', label: 'Life' },
          { id: 'netrun', label: 'NetRun' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex-1 py-2 px-4 font-bold uppercase text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-black text-white'
                : 'bg-transparent text-black hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="p-4 bg-white min-h-[500px] max-h-[600px] overflow-y-auto">
        {activeTab === 'skills' && <SkillsTab character={character} editable={editable} />}
        {activeTab === 'combat' && (
          <CombatTab key={character.id} character={character} editable={editable} />
        )}
        {activeTab === 'body' && <BodyTab character={character} editable={editable} />}
        {activeTab === 'gear' && <GearTab character={character} editable={editable} />}
        {activeTab === 'cyberware' && <CyberwareTab character={character} editable={editable} />}
        {activeTab === 'life' && <LifeTab character={character} editable={editable} />}
        {activeTab === 'netrun' && <NetrunTab character={character} editable={editable} />}
      </div>
    </div>
  );
}
