import type { Cyberware } from '../types';
import { cyberwareInitiativeBonusFromRaw } from './cyberware-initiative';
import { initiativeBonusLookupByCyberwareName } from '../data/cyberware-name-initiative-map';

/** Parse initiative bonus from a JSON row; if missing, match by `name` against the local compendium. */
export function resolveCyberwareInitiativeFromRaw(o: Record<string, unknown>): number {
  let ini = cyberwareInitiativeBonusFromRaw(o);
  if (ini !== 0) return ini;
  const nm = typeof o.name === 'string' ? o.name : '';
  if (nm.trim()) {
    const fromCatalog = initiativeBonusLookupByCyberwareName(nm);
    if (fromCatalog !== 0) return fromCatalog;
  }
  return 0;
}

/** Initiative bonus for an equipped cyberware item on the sheet (handles legacy rows with no `initiativeBonus`). */
export function cyberwareInitiativeBonusFromSheet(cw: Pick<Cyberware, 'name' | 'initiativeBonus'>): number {
  const b = cw.initiativeBonus;
  if (b !== undefined && b !== null && b !== 0) return b;
  const fromCatalog = initiativeBonusLookupByCyberwareName(cw.name);
  if (fromCatalog !== 0) return fromCatalog;
  if (typeof b === 'number' && Number.isFinite(b)) return b;
  return 0;
}
