import type { Character, DiceRollIntent, RollResult } from '@/lib/types';
import { fnffAttackTotalMeetsDv } from '@/lib/game-logic/lookups';
import { isFlatSaveSuccess } from '@/lib/game-logic/formulas';

/**
 * Caller-supplied fields for posting a sheet roll to session chat.
 * Spread into `openDiceRoller(..., { kind: 'attack' | 'custom' | ..., ...sheetRollContext(...) })`.
 */
export function sheetRollContext(
  character: Character,
  sessionId: string | null,
  rollSummary: string,
): { rollSummary: string; sessionId?: string; speakerName: string } {
  return {
    rollSummary,
    sessionId: sessionId ?? undefined,
    speakerName: character.name,
  };
}

function describeRoll(intent: DiceRollIntent, formula: string): string | null {
  if (intent.kind === 'custom') return intent.rollSummary;
  if ('rollSummary' in intent && intent.rollSummary) return intent.rollSummary;
  switch (intent.kind) {
    case 'stun':
      return 'Stun save';
    case 'stun_recovery':
      return 'Stun recovery';
    case 'death':
      return 'Death save';
    case 'attack':
      return 'Attack roll';
    case 'stabilization':
      return `Stabilization (patient damage ${intent.targetDamage})`;
    default:
      return formula;
  }
}

export function buildDiceRollChatMessage(
  intent: DiceRollIntent | null,
  formula: string,
  result: Pick<RollResult, 'total' | 'rolls'>,
): { sessionId: string; speakerName: string; playerMessage: string } | null {
  if (!intent) return null;

  if (intent.kind === 'gm_request') {
    const sessionId = intent.sessionId?.trim();
    if (!sessionId) return null;
    const speaker = intent.speakerName?.trim() || 'Player';
    const label =
      intent.rollSummary?.trim() ||
      intent.reason?.trim() ||
      intent.formula.trim() ||
      'requested roll';
    return {
      sessionId,
      speakerName: speaker,
      playerMessage: `[Roll] ${formula} = ${result.total} (dice: ${result.rolls.join(', ')}) - ${label}`,
    };
  }

  const sessionId = intent.sessionId?.trim();
  if (!sessionId) return null;
  const speaker = intent.speakerName?.trim() || 'Player';
  const label = describeRoll(intent, formula);
  if (!label) return null;

  if (intent.kind === 'attack' && typeof intent.difficultyValue === 'number') {
    const hit = fnffAttackTotalMeetsDv(result.total, intent.difficultyValue);
    const tgt = intent.targetName?.trim();
    const tgtPart = tgt ? ` vs **${tgt}**` : '';
    const dv = intent.difficultyValue;
    const bracket =
      intent.rangeBracketLabel?.trim() && intent.rangeBracketLabel.trim().length > 0
        ? ` - ${intent.rangeBracketLabel.trim()}`
        : '';
    return {
      sessionId,
      speakerName: speaker,
      playerMessage: `${speaker} rolled **${result.total}** for ${label}${tgtPart}${bracket} - **${hit ? 'HIT' : 'MISS'}** vs DV **${dv}** (${formula})`,
    };
  }

  if (
    (intent.kind === 'stun' || intent.kind === 'stun_recovery' || intent.kind === 'death') &&
    typeof intent.saveTarget === 'number'
  ) {
    const saveTarget = intent.saveTarget;
    const success = isFlatSaveSuccess(result.total, saveTarget);
    const outcome =
      intent.kind === 'death'
        ? success
          ? '**survived**'
          : '**DIED** (failed death save - damage set to 41)'
        : intent.kind === 'stun_recovery'
          ? success
            ? '**recovered** (no longer STUNNED)'
            : '**still STUNNED**'
          : success
            ? '**stayed conscious** (not stunned)'
            : '**STUNNED**';
    return {
      sessionId,
      speakerName: speaker,
      playerMessage: `${speaker} rolled **${result.total}** for ${label} - FNFF: need **<=${saveTarget}** on flat d10 - ${outcome} (${formula})`,
    };
  }

  return {
    sessionId,
    speakerName: speaker,
    playerMessage: `${speaker} rolled ${result.total} for ${label} (${formula})`,
  };
}
