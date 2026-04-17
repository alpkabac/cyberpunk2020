/**
 * Entering / crossing suppressive fire: Athletics + REF + 1d10 (exploding) vs save number.
 * Fail: 1d6 hits, random locations, weapon damage each.
 */

import type { MapSuppressiveZone } from '../types';
import { useGameStore } from '@/lib/store/game-store';
import { rollDice } from './dice';
import { fnffAttackTotalMeetsDv, rollFnffHitLocation } from './lookups';

function athleticsSkillValue(character: {
  skills: Array<{ name: string; value: number }>;
}): number {
  const s = character.skills.find((k) => k.name.toLowerCase() === 'athletics');
  return s?.value ?? 0;
}

function newChatId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Resolves suppressive fire for a token that entered a zone (automated roll + damage).
 */
export function resolveSuppressiveZoneEntry(victimCharacterId: string, zone: MapSuppressiveZone): void {
  const st = useGameStore.getState();
  const victim = st.characters.byId[victimCharacterId] ?? st.npcs.byId[victimCharacterId];
  if (!victim || victim.damage >= 41) return;

  const ath = athleticsSkillValue(victim);
  const ref = victim.stats.ref.total ?? 0;
  const staticBonus = ath + ref;
  const atk = rollDice(`1d10+${staticBonus}`);
  if (!atk) return;

  const save = Math.max(1, zone.saveNumber);
  const ok = fnffAttackTotalMeetsDv(atk.total, save);
  const dmgFormula = zone.weaponDamage?.trim() || '2d6';
  const lines: string[] = [
    `**Suppressive fire** (${zone.weaponName ?? 'weapon'}): **${victim.name}** Athletics+REF+d10 → ${atk.total} vs **${save}** — ${ok ? 'safe' : 'HIT by fire'}`,
  ];

  if (ok) {
    useGameStore.getState().addChatMessage({
      id: newChatId(),
      speaker: victim.name,
      text: lines.join('\n'),
      timestamp: Date.now(),
      type: 'roll',
    });
    return;
  }

  const nRoll = rollDice('flat:1d6');
  const nHits = Math.max(0, Math.min(6, nRoll?.rolls[0] ?? 0));
  lines.push(`Failed save: **${nHits}** hit(s) (1d6).`);

  for (let i = 0; i < nHits; i++) {
    const loc = rollFnffHitLocation();
    const zoneHit = loc.zone;
    const dmg = rollDice(dmgFormula);
    const amt = dmg?.total ?? 0;
    lines.push(`  Hit ${i + 1}: loc d10=${loc.d10} → ${zoneHit ?? '?'}, ${dmgFormula} → **${amt}**`);
    useGameStore.getState().applyDamage(victimCharacterId, amt, zoneHit, zone.weaponAp, false, dmgFormula, null);
  }

  useGameStore.getState().addChatMessage({
    id: newChatId(),
    speaker: victim.name,
    text: lines.join('\n'),
    timestamp: Date.now(),
    type: 'roll',
  });
}
