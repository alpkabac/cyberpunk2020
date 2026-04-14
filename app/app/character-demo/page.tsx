'use client';

import { useEffect } from 'react';
import { CharacterSheet } from '@/components/character';
import { useGameStore } from '@/lib/store/game-store';
import { Character, createStatBlock, ROLE_SPECIAL_ABILITIES, Weapon, Armor, Cyberware } from '@/lib/types';

export default function CharacterDemoPage() {
  const addCharacter = useGameStore((state) => state.addCharacter);
  const characters = useGameStore((state) => state.characters);

  useEffect(() => {
    if (characters.allIds.length > 0) return;

    const demoCharacter: Character = {
      id: 'demo-char-1',
      userId: 'demo-user',
      sessionId: 'demo-session',
      name: 'Johnny Silverhand',
      type: 'character',
      imageUrl: '',
      role: 'Rockerboy',
      age: 32,
      points: 60,
      stats: {
        int: createStatBlock(7),
        ref: createStatBlock(8),
        tech: createStatBlock(5),
        cool: createStatBlock(9),
        attr: createStatBlock(8),
        luck: createStatBlock(6),
        ma: createStatBlock(7),
        bt: createStatBlock(8),
        emp: createStatBlock(4),
      },
      specialAbility: {
        name: ROLE_SPECIAL_ABILITIES['Rockerboy'],
        value: 7,
      },
      reputation: 8,
      improvementPoints: 15,
      skills: [
        { id: 'skill-1', name: 'Handgun', value: 6, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-2', name: 'Brawling', value: 5, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-3', name: 'Streetwise', value: 7, linkedStat: 'cool', category: 'COOL', isChipped: false },
        { id: 'skill-4', name: 'Awareness/Notice', value: 6, linkedStat: 'int', category: 'INT', isChipped: false },
        { id: 'skill-5', name: 'Perform', value: 8, linkedStat: 'emp', category: 'EMP', isChipped: false },
        { id: 'skill-6', name: 'Play Instrument', value: 7, linkedStat: 'tech', category: 'TECH', isChipped: false },
        { id: 'skill-7', name: 'Persuasion & Fast Talk', value: 5, linkedStat: 'emp', category: 'EMP', isChipped: false },
        { id: 'skill-8', name: 'Melee', value: 4, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-9', name: 'Dodge & Escape', value: 4, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-10', name: 'Athletics', value: 3, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-11', name: 'Stealth', value: 3, linkedStat: 'ref', category: 'REF', isChipped: true },
        { id: 'skill-12', name: 'Rifle', value: 4, linkedStat: 'ref', category: 'REF', isChipped: false },
      ],
      damage: 6,
      isStunned: false,
      hitLocations: {
        Head: { location: [1], stoppingPower: 14, ablation: 0 },
        Torso: { location: [2, 3, 4], stoppingPower: 18, ablation: 2 },
        rArm: { location: [5], stoppingPower: 14, ablation: 1 },
        lArm: { location: [6], stoppingPower: 0, ablation: 0 },
        rLeg: { location: [7, 8], stoppingPower: 14, ablation: 0 },
        lLeg: { location: [9, 10], stoppingPower: 14, ablation: 1 },
      },
      sdp: {
        sum: { Head: 0, Torso: 0, rArm: 25, lArm: 0, rLeg: 0, lLeg: 0 },
        current: { Head: 0, Torso: 0, rArm: 20, lArm: 0, rLeg: 0, lLeg: 0 },
      },
      eurobucks: 2500,
      items: [
        {
          id: 'weapon-1',
          name: 'Malorian Arms 3516',
          type: 'weapon',
          flavor: 'Custom heavy pistol with silver finish',
          notes: "Johnny's signature piece",
          cost: 1500,
          weight: 2,
          equipped: true,
          source: 'Custom',
          weaponType: 'Pistol',
          accuracy: 2,
          concealability: 'J',
          availability: 'R',
          ammoType: '12mm',
          damage: '4d6+1',
          ap: true,
          shotsLeft: 8,
          shots: 10,
          rof: 2,
          reliability: 'VR',
          range: 50,
          attackType: 'Auto',
          attackSkill: 'Handgun',
          isAutoCapable: true,
        } as Weapon,
        {
          id: 'weapon-2',
          name: 'Kendachi Mono-katana',
          type: 'weapon',
          flavor: 'Mono-edged katana, cuts through anything',
          notes: '',
          cost: 600,
          weight: 1,
          equipped: true,
          source: 'Core',
          weaponType: 'Melee',
          accuracy: 1,
          concealability: 'N',
          availability: 'P',
          ammoType: '',
          damage: '4d6',
          ap: false,
          shotsLeft: 0,
          shots: 0,
          rof: 1,
          reliability: 'VR',
          range: 1,
          attackType: 'Mono',
          attackSkill: 'Melee',
          isAutoCapable: false,
        } as Weapon,
        {
          id: 'armor-1',
          name: 'Light Armor Jacket',
          type: 'armor',
          flavor: 'Standard street protection',
          notes: '',
          cost: 150,
          weight: 2,
          equipped: true,
          source: 'Core',
          coverage: {
            Torso: { stoppingPower: 14, ablation: 0 },
            rArm: { stoppingPower: 14, ablation: 0 },
            lArm: { stoppingPower: 14, ablation: 0 },
          },
          encumbrance: 0,
        } as Armor,
        {
          id: 'armor-2',
          name: 'Steel Helmet',
          type: 'armor',
          flavor: 'Military surplus head protection',
          notes: '',
          cost: 100,
          weight: 1,
          equipped: true,
          source: 'Core',
          coverage: {
            Head: { stoppingPower: 14, ablation: 0 },
          },
          encumbrance: 0,
        } as Armor,
        {
          id: 'cyber-1',
          name: 'Cyberoptic (Left)',
          type: 'cyberware',
          flavor: 'Enhanced vision system with IR overlay',
          notes: 'Includes Times Square Marquee and Targeting Scope',
          cost: 500,
          weight: 0,
          equipped: true,
          source: 'Core',
          surgCode: 'MA',
          humanityCost: '2d6',
          humanityLoss: 7,
          cyberwareType: 'Optics',
        } as Cyberware,
        {
          id: 'cyber-2',
          name: 'Cyberarm (Right)',
          type: 'cyberware',
          flavor: 'Chrome arm with built-in tool hand',
          notes: 'SDP 25',
          cost: 2000,
          weight: 0,
          equipped: true,
          source: 'Core',
          surgCode: 'CR',
          humanityCost: '2d6+2',
          humanityLoss: 9,
          cyberwareType: 'Arms',
        } as Cyberware,
      ],
      combatModifiers: { initiative: 0, stunSave: 0 },
      netrunDeck: null,
      lifepath: {
        style: {
          clothes: 'Leathers',
          hair: 'Wild & spiked',
          affectations: 'Mirrorshades, dog tags',
        },
        ethnicity: 'Anglo-American',
        language: 'English',
        familyBackground: 'Street kid, parents killed in Corporate raid on the Combat Zone',
        siblings: '1 sister (missing)',
        motivations: {
          traits: 'Rebellious, loyal to friends, hates authority',
          valuedPerson: 'Alt Cunningham',
          valueMost: 'Freedom',
          feelAboutPeople: 'People are worth fighting for',
          valuedPossession: 'His guitar',
        },
        lifeEvents: [
          { age: 17, event: 'Formed first band "Samurai" with Kerry Eurodyne' },
          { age: 19, event: 'First gig at the Rainbow Cadenza, crowd of 200' },
          { age: 22, event: 'Samurai goes big — signed with Universal Music' },
          { age: 25, event: 'Publicly defied Arasaka Corp on live broadcast' },
          { age: 28, event: 'Romance with netrunner Alt Cunningham begins' },
          { age: 30, event: 'Alt kidnapped by Arasaka. Failed rescue attempt.' },
        ],
        notes: 'The voice of a generation. Still fighting the good fight.',
      },
    };

    addCharacter(demoCharacter);
  }, [addCharacter, characters.allIds.length]);

  const characterId = characters.allIds[0];

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-cyan-400 mb-8 uppercase tracking-wider">
          Cyberpunk 2020 — Character Sheet
        </h1>

        {characterId ? (
          <CharacterSheet characterId={characterId} editable={true} />
        ) : (
          <div className="text-center text-gray-400 py-8">Loading character...</div>
        )}
      </div>
    </div>
  );
}
