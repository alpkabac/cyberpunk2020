/**
 * Build-time map: exact cyberware name (trimmed, lowercased) → initiative-only bonus from local compendium.
 * Used to backfill legacy sheet rows that omit `initiativeBonus`.
 */

import localCyberware from './cyberware.json';
import { cyberwareInitiativeBonusFromRaw } from '../game-logic/cyberware-initiative';

function flattenFoundryCyberware(raw: Record<string, unknown>): Record<string, unknown> {
  const data = (raw.data || raw.system || {}) as Record<string, unknown>;
  return {
    ...data,
    id: raw._id || raw.id,
    name: raw.name,
  };
}

function buildMap(): Map<string, number> {
  const m = new Map<string, number>();
  for (const raw of localCyberware as Record<string, unknown>[]) {
    const flat = flattenFoundryCyberware(raw);
    const bonus = cyberwareInitiativeBonusFromRaw(flat);
    if (bonus === 0) continue;
    const name = String(raw.name ?? flat.name ?? '')
      .trim()
      .toLowerCase();
    if (!name) continue;
    m.set(name, bonus);
  }
  return m;
}

let cached: Map<string, number> | null = null;

export function initiativeBonusLookupByCyberwareName(name: string): number {
  if (!cached) cached = buildMap();
  const key = name.trim().toLowerCase();
  if (!key) return 0;
  return cached.get(key) ?? 0;
}
