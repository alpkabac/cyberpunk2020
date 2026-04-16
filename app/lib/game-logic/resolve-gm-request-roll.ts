import type { Character, Stats } from '@/lib/types';

/** Mirrors `request_roll` tool / chat metadata. */
export type GmRollRequestKind = 'skill' | 'stat' | 'raw_formula';

const STAT_KEYS = new Set<string>([
  'int',
  'ref',
  'tech',
  'cool',
  'attr',
  'luck',
  'ma',
  'bt',
  'emp',
]);

export interface ResolveGmRequestRollInput {
  roll_kind?: GmRollRequestKind | string;
  formula?: string;
  character_id?: string | null;
  skill_id?: string | null;
  /** Lowercase stat key, e.g. ref, int */
  stat?: string | null;
}

export interface ResolveGmRequestRollOptions {
  /** Same toggle as Skills tab: add role special ability to skill rolls. */
  includeSpecialAbilityInSkillRolls: boolean;
}

export interface ResolveGmRequestRollResult {
  /** Formula passed to the dice engine (e.g. 1d10+12). */
  formula: string;
  /** True when roll_kind + ids produced the formula; false = fallback to raw formula. */
  resolvedFromCharacter: boolean;
  /** Short label for UI (skill name or stat key). */
  label?: string;
}

function normalizeKind(k: unknown): GmRollRequestKind {
  if (k === 'skill' || k === 'stat' || k === 'raw_formula') return k;
  return 'raw_formula';
}

/**
 * Builds the dice formula for a GM roll request using sheet data when possible.
 * Falls back to `formula` (or 1d10) when character or ids are missing.
 */
export function resolveGmRequestRoll(
  character: Character | null | undefined,
  meta: ResolveGmRequestRollInput,
  opts: ResolveGmRequestRollOptions,
): ResolveGmRequestRollResult {
  const raw =
    typeof meta.formula === 'string' && meta.formula.trim() ? meta.formula.trim() : '';
  const kind = normalizeKind(meta.roll_kind);

  if (!character) {
    return { formula: raw || '1d10', resolvedFromCharacter: false };
  }

  if (kind === 'skill' && typeof meta.skill_id === 'string' && meta.skill_id) {
    const skill = character.skills.find((s) => s.id === meta.skill_id);
    if (skill) {
      const statTotal = character.stats[skill.linkedStat]?.total ?? 0;
      let total = skill.value + statTotal;
      if (opts.includeSpecialAbilityInSkillRolls && character.specialAbility) {
        total += character.specialAbility.value;
      }
      return {
        formula: `1d10+${total}`,
        resolvedFromCharacter: true,
        label: skill.name,
      };
    }
    return { formula: raw, resolvedFromCharacter: false };
  }

  if (kind === 'stat' && typeof meta.stat === 'string' && meta.stat) {
    const key = meta.stat.toLowerCase() as keyof Stats;
    if (STAT_KEYS.has(key) && character.stats[key]) {
      const t = character.stats[key].total;
      return {
        formula: `1d10+${t}`,
        resolvedFromCharacter: true,
        label: key.toUpperCase(),
      };
    }
    return { formula: raw, resolvedFromCharacter: false };
  }

  return { formula: raw || '1d10', resolvedFromCharacter: false };
}

/** Server-side (tool executor): same math, SA off by default for neutral suggestion text. */
export function resolveGmRequestRollForServer(
  character: Character,
  meta: ResolveGmRequestRollInput,
): ResolveGmRequestRollResult {
  return resolveGmRequestRoll(character, meta, { includeSpecialAbilityInSkillRolls: false });
}

/** Map persisted chat metadata to resolver input (camelCase characterId from DB). */
export function rollRequestMetadataToInput(meta: Record<string, unknown>): ResolveGmRequestRollInput {
  return {
    roll_kind: typeof meta.roll_kind === 'string' ? meta.roll_kind : undefined,
    formula: typeof meta.formula === 'string' ? meta.formula : undefined,
    character_id: typeof meta.characterId === 'string' ? meta.characterId : null,
    skill_id: typeof meta.skill_id === 'string' ? meta.skill_id : null,
    stat: typeof meta.stat === 'string' ? meta.stat : null,
  };
}
