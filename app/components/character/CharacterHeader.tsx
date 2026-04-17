'use client';

import React from 'react';
import { Character, RoleType, ROLE_SPECIAL_ABILITIES } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { StatsRow } from './StatsRow';
import { WoundTracker } from './WoundTracker';

interface CharacterHeaderProps {
  character: Character;
  editable: boolean;
}

const ROLES: RoleType[] = [
  'Solo', 'Rockerboy', 'Netrunner', 'Media', 'Nomad',
  'Fixer', 'Cop', 'Corp', 'Techie', 'Medtechie',
];

export function CharacterHeader({ character, editable }: CharacterHeaderProps) {
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);

  const handleFieldChange = (field: string, value: unknown) => {
    if (!editable) return;
    updateCharacterField(character.id, field, value);
  };

  const handleRoleChange = (newRole: RoleType) => {
    handleFieldChange('role', newRole);
    handleFieldChange('specialAbility', {
      name: ROLE_SPECIAL_ABILITIES[newRole],
      value: character.specialAbility?.value || 0,
    });
  };

  return (
    <header className="p-4 bg-[#f5f5dc] border-b-2 border-black">
      {/* Top Row: Name, Role, Age, REP, PTS */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-grow">
          {editable ? (
            <input
              type="text"
              value={character.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className="text-3xl font-bold uppercase bg-transparent border-b-2 border-black w-full focus:outline-none"
            />
          ) : (
            <h1 className="text-3xl font-bold uppercase">{character.name}</h1>
          )}
        </div>

        <div className="flex gap-3 text-sm flex-wrap">
          <div className="flex flex-col">
            <label className="font-bold uppercase text-xs">Role</label>
            {editable ? (
              <select
                value={character.role}
                onChange={(e) => handleRoleChange(e.target.value as RoleType)}
                className="border border-black px-2 py-1 font-bold"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-bold">{character.role}</span>
            )}
          </div>

          <div className="flex flex-col">
            <label className="font-bold uppercase text-xs">Age</label>
            {editable ? (
              <input
                type="number"
                value={character.age}
                onChange={(e) => handleFieldChange('age', parseInt(e.target.value) || 16)}
                className="border border-black px-2 py-1 w-14"
                min="16"
              />
            ) : (
              <span>{character.age}</span>
            )}
          </div>

          <div className="flex flex-col">
            <label className="font-bold uppercase text-xs">REP</label>
            {editable ? (
              <input
                type="number"
                value={character.reputation}
                onChange={(e) =>
                  handleFieldChange('reputation', Math.max(0, parseInt(e.target.value) || 0))
                }
                className="border border-black px-2 py-1 w-14"
                min="0"
              />
            ) : (
              <span className="font-bold">{character.reputation}</span>
            )}
          </div>

          <div className="flex flex-col">
            <label className="font-bold uppercase text-xs">PTS</label>
            {editable ? (
              <input
                type="number"
                value={character.points}
                onChange={(e) =>
                  handleFieldChange('points', Math.max(0, parseInt(e.target.value) || 0))
                }
                className="border border-black px-2 py-1 w-14"
                min="0"
              />
            ) : (
              <span>{character.points}</span>
            )}
          </div>

          <div className="flex flex-col">
            <label className="font-bold uppercase text-xs">EUR</label>
            <span className="font-bold text-green-700">€{character.eurobucks.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Image, Stats, Wound Tracker — items-start so portrait column is not stretched to stats height */}
      <div className="flex items-start gap-4">
        {/* Portrait + IP (compact; only as tall as image + IP row) */}
        <div
          className="shrink-0 w-32 flex flex-col self-start border-2 border-black bg-[#faf8ef]"
          title="Improvement Points — editable here; the AI-GM can also update this (e.g. adjust_improvement_points)."
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- character portraits use arbitrary external URLs with inline SVG fallback */}
          <img
            src={character.imageUrl || '/placeholder-character.png'}
            alt={character.name}
            className="w-full h-40 object-cover block border-b border-black/25"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="160" viewBox="0 0 128 160"%3E%3Crect fill="%23ddd" width="128" height="160"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="16" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
            }}
          />
          <div className="flex items-center justify-center gap-1.5 px-1 py-1">
            <span className="font-bold uppercase text-[10px] text-black/80 leading-none shrink-0">IP</span>
            {editable ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={character.improvementPoints}
                onChange={(e) =>
                  handleFieldChange(
                    'improvementPoints',
                    Math.max(0, parseInt(e.target.value, 10) || 0),
                  )
                }
                className="min-w-0 flex-1 border border-black/60 bg-white px-1 py-0.5 text-center text-xs font-mono font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-black"
                aria-label="Improvement points"
              />
            ) : (
              <span className="text-xs font-mono font-bold tabular-nums">{character.improvementPoints}</span>
            )}
          </div>
        </div>

        {/* Stats and Wound Tracker */}
        <div className="flex-grow flex flex-col gap-2">
          <StatsRow character={character} editable={editable} />
          <WoundTracker character={character} editable={editable} />
        </div>
      </div>
    </header>
  );
}
