/**
 * Map app Character model ↔ Postgres `characters` row (JSONB columns).
 * Omits client-only fields (e.g. derivedStats).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character, Stats, StatBlock } from '../types';

/** Persist stat modifiers only; `total` is recomputed on load (avoids save ↔ Realtime echo loops). */
function statsForDb(stats: Character['stats']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(stats) as Array<keyof Stats>) {
    const s = stats[key];
    const { total: _t, ...rest } = s as StatBlock;
    void _t;
    out[key] = rest;
  }
  return out;
}

export function serializeCharacterForDb(c: Character): Record<string, unknown> {
  return {
    name: c.name,
    type: c.type,
    image_url: c.imageUrl,
    role: c.role,
    age: c.age,
    points: c.points,
    stats: statsForDb(c.stats),
    special_ability: c.specialAbility,
    reputation: c.reputation,
    improvement_points: c.improvementPoints,
    skills: c.skills,
    damage: c.damage,
    is_stunned: c.isStunned,
    is_stabilized: c.isStabilized,
    conditions: c.conditions,
    combat_modifiers: c.combatModifiers ?? { initiative: 0, stunSave: 0, deathSave: 0 },
    hit_locations: c.hitLocations,
    sdp: c.sdp,
    eurobucks: c.eurobucks,
    items: c.items,
    netrun_deck: c.netrunDeck,
    lifepath: c.lifepath,
  };
}

export async function saveCharacterToSupabase(
  client: SupabaseClient,
  character: Character,
): Promise<{ error: Error | null }> {
  const payload = serializeCharacterForDb(character);
  const { error } = await client.from('characters').update(payload).eq('id', character.id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
