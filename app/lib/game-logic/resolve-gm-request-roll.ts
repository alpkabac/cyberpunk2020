import type { Character, Reliability, Stats, Weapon } from '@/lib/types';

/** Mirrors `request_roll` tool / chat metadata. */
export type GmRollRequestKind = 'skill' | 'stat' | 'raw_formula' | 'attack';

/** Fields the client merges into `DiceRollIntent` (attack) for GM-requested FNFF rolls. */
export interface GmRequestAttackDiceFields {
  characterId: string;
  weaponId: string;
  reliability: Reliability;
  isMelee: boolean;
  isAutoWeapon: boolean;
  difficultyValue: number;
  rangeBracketLabel?: string;
  targetCharacterId?: string;
  targetName?: string;
  promptedByGmRequest: true;
}

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
  /** `roll_kind: attack` — weapon row id from character.items */
  weapon_id?: string | null;
  /** FNFF difficulty value (range bracket + cover, etc.) */
  difficulty_value?: number | null;
  /** Referee-applied to-hit modifiers not on the sheet (cover, movement, vision, …). */
  ranged_modifier_total?: number | null;
  range_bracket_label?: string | null;
  target_character_id?: string | null;
  target_name?: string | null;
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
  /** Present when `roll_kind: attack` resolved from sheet + DV. */
  attackDice?: GmRequestAttackDiceFields;
}

function attackSkillTotal(character: Character, weapon: Weapon): number {
  const skill = character.skills.find(
    (s) => s.name.toLowerCase() === weapon.attackSkill?.toLowerCase(),
  );
  const skillVal = skill?.value ?? 0;
  const refTotal = character.stats.ref.total || 0;
  return refTotal + skillVal + (weapon.accuracy || 0);
}

function normalizeKind(k: unknown): GmRollRequestKind {
  if (k === 'skill' || k === 'stat' || k === 'raw_formula' || k === 'attack') return k;
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

  if (kind === 'attack') {
    const weaponId = typeof meta.weapon_id === 'string' ? meta.weapon_id.trim() : '';
    const dv =
      typeof meta.difficulty_value === 'number' && Number.isFinite(meta.difficulty_value)
        ? meta.difficulty_value
        : NaN;
    if (!weaponId || !Number.isFinite(dv)) {
      return { formula: raw || '1d10', resolvedFromCharacter: false };
    }
    const weapon = character.items.find((i): i is Weapon => i.type === 'weapon' && i.id === weaponId);
    if (!weapon) {
      return { formula: raw || '1d10', resolvedFromCharacter: false };
    }
    let modSum = 0;
    if (meta.ranged_modifier_total !== undefined && meta.ranged_modifier_total !== null) {
      const m = Number(meta.ranged_modifier_total);
      if (Number.isFinite(m)) modSum = m;
    }
    const base = attackSkillTotal(character, weapon);
    const totalBonus = base + modSum;
    const rangeLabel =
      typeof meta.range_bracket_label === 'string' && meta.range_bracket_label.trim()
        ? meta.range_bracket_label.trim()
        : undefined;
    const tChar =
      typeof meta.target_character_id === 'string' && meta.target_character_id.trim()
        ? meta.target_character_id.trim()
        : undefined;
    const tName =
      typeof meta.target_name === 'string' && meta.target_name.trim()
        ? meta.target_name.trim()
        : undefined;
    return {
      formula: `1d10+${totalBonus}`,
      resolvedFromCharacter: true,
      label: `${weapon.name} attack`,
      attackDice: {
        characterId: character.id,
        weaponId: weapon.id,
        reliability: weapon.reliability,
        isMelee: weapon.weaponType === 'Melee',
        isAutoWeapon: weapon.isAutoCapable || weapon.attackType === 'Auto',
        difficultyValue: dv,
        ...(rangeLabel ? { rangeBracketLabel: rangeLabel } : {}),
        ...(tChar ? { targetCharacterId: tChar } : {}),
        ...(tName ? { targetName: tName } : {}),
        promptedByGmRequest: true,
      },
    };
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
  const dvRaw = meta.difficulty_value;
  const difficulty_value =
    typeof dvRaw === 'number' && Number.isFinite(dvRaw)
      ? dvRaw
      : typeof dvRaw === 'string' && dvRaw.trim() !== '' && Number.isFinite(Number(dvRaw))
        ? Number(dvRaw)
        : null;
  const rmRaw = meta.ranged_modifier_total;
  const ranged_modifier_total =
    typeof rmRaw === 'number' && Number.isFinite(rmRaw)
      ? rmRaw
      : typeof rmRaw === 'string' && rmRaw.trim() !== '' && Number.isFinite(Number(rmRaw))
        ? Number(rmRaw)
        : null;
  return {
    roll_kind: typeof meta.roll_kind === 'string' ? meta.roll_kind : undefined,
    formula: typeof meta.formula === 'string' ? meta.formula : undefined,
    character_id: typeof meta.characterId === 'string' ? meta.characterId : null,
    skill_id: typeof meta.skill_id === 'string' ? meta.skill_id : null,
    stat: typeof meta.stat === 'string' ? meta.stat : null,
    weapon_id: typeof meta.weapon_id === 'string' ? meta.weapon_id : null,
    difficulty_value,
    ranged_modifier_total,
    range_bracket_label: typeof meta.range_bracket_label === 'string' ? meta.range_bracket_label : null,
    target_character_id:
      typeof meta.target_character_id === 'string' ? meta.target_character_id : null,
    target_name: typeof meta.target_name === 'string' ? meta.target_name : null,
  };
}
