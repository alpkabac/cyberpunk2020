import type { Character } from '../types';

/** Default when `team` is blank: PCs share `party`, NPCs `hostile`. */
export function effectiveCharacterTeam(c: Character): string {
  const t = (c.team ?? '').trim();
  if (t.length > 0) return t;
  return c.type === 'npc' ? 'hostile' : 'party';
}

export function teamsAreEnemies(a: Character, b: Character): boolean {
  return effectiveCharacterTeam(a) !== effectiveCharacterTeam(b);
}
