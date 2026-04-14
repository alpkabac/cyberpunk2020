'use client';

import { useState } from 'react';
import { Zone } from '@/lib/types';
import { hitLocationRollRanges } from '@/lib/game-logic/lookups';

interface TargetSelectorProps {
  onSelect: (location: Zone) => void;
  onCancel: () => void;
}

const BODY_LOCATIONS: Array<{ zone: Zone; label: string }> = [
  { zone: 'Head', label: 'Head' },
  { zone: 'Torso', label: 'Torso' },
  { zone: 'rArm', label: 'Right Arm' },
  { zone: 'lArm', label: 'Left Arm' },
  { zone: 'rLeg', label: 'Right Leg' },
  { zone: 'lLeg', label: 'Left Leg' },
];

export function TargetSelector({ onSelect, onCancel }: TargetSelectorProps) {
  const [hoveredZone, setHoveredZone] = useState<Zone | null>(null);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white border-4 border-black p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold uppercase">Select Target Location</h2>
          <button
            onClick={onCancel}
            className="text-3xl font-bold hover:text-red-600"
          >
            ×
          </button>
        </div>

        <div className="space-y-2">
          {BODY_LOCATIONS.map(({ zone, label }) => (
            <button
              key={zone}
              onClick={() => onSelect(zone)}
              onMouseEnter={() => setHoveredZone(zone)}
              onMouseLeave={() => setHoveredZone(null)}
              className={`w-full border-2 border-black p-3 text-left font-bold uppercase transition-colors ${
                hoveredZone === zone
                  ? zone === 'Head'
                    ? 'bg-red-600 text-white'
                    : 'bg-red-500 text-white'
                  : 'bg-white hover:bg-gray-100'
              }`}
            >
              <div className="flex justify-between items-center">
                <span>{label}</span>
                <span className="text-sm font-normal">d10: {hitLocationRollRanges[zone]}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 text-sm text-gray-600 border-t-2 border-gray-300 pt-3">
          <p className="font-bold">Combat Rules:</p>
          <p className="text-red-600 font-bold">• Head hits deal DOUBLE damage!</p>
          <p>• Armor SP is subtracted from damage first</p>
          <p>• SP reduced by 1 per hit (ablation)</p>
          <p>• BTM automatically reduces remaining damage</p>
        </div>
      </div>
    </div>
  );
}
