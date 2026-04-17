/**
 * Attack fumble resolution (FNFF + Foundry-aligned reliability thresholds).
 */

import { rollDice } from './dice';
import {
  meleeFumbleTable,
  pickReflexCombatFumbleRow,
  reliabilityFumbleThreshold,
  getHitLocation,
} from './lookups';
import type { Reliability } from '../types';

export type AttackFumbleResolution = {
  lines: string[];
};

export function resolveAttackFumbleOutcome(
  isMelee: boolean,
  reliability: Reliability,
): AttackFumbleResolution {
  const lines: string[] = [];

  if (isMelee) {
    const r = rollDice('flat:1d6');
    if (!r) return { lines: ['Fumble: could not roll 1d6.'] };
    const n = r.rolls[0];
    const text = meleeFumbleTable[n] ?? meleeFumbleTable[6];
    lines.push(`Melee fumble (d6=${n}): ${text}`);
    return { lines };
  }

  const tableRoll = rollDice('flat:1d10');
  if (!tableRoll) return { lines: ['Fumble: could not roll fumble table.'] };
  const d10 = tableRoll.rolls[0];
  const row = pickReflexCombatFumbleRow(d10);
  lines.push(`Ranged fumble (d10=${d10}): ${row.description}`);

  const thr = reliabilityFumbleThreshold[reliability] ?? 5;

  if (row.needsReliability) {
    const rel = rollDice('flat:1d10');
    if (!rel) return { lines };
    const fails = rel.total <= thr;
    lines.push(
      `Reliability (${reliability}): rolled ${rel.total}, threshold ${thr} → ${fails ? 'fail' : 'pass'}`,
    );
    if (row.needsReliability === 'discharge') {
      lines.push(fails ? 'Discharge applies (GM).' : 'No accidental discharge.');
    }
    if (row.needsReliability === 'jam') {
      if (fails) {
        const clear = rollDice('flat:1d6');
        if (clear) lines.push(`Jam: clear in ${clear.total} round(s) (1d6).`);
      } else {
        lines.push('No jam.');
      }
    }
  }

  if (row.needsLocation) {
    const loc = rollDice('flat:1d10');
    if (!loc) return { lines };
    const zone = getHitLocation(loc.rolls[0]);
    lines.push(`Hit location: ${zone ?? '?'} (d10=${loc.rolls[0]}). Roll damage per table.`);
  }

  return { lines };
}
