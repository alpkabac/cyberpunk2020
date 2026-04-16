import type { Character, DiceRollIntent } from '@/lib/types';

/**
 * Caller-supplied fields for posting a sheet roll to the AI-GM (session play).
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

function describeRollForGm(intent: DiceRollIntent, formula: string): string | null {
  if (intent.kind === 'gm_request') return null;
  if (intent.kind === 'custom') return intent.rollSummary;
  if ('rollSummary' in intent && intent.rollSummary) return intent.rollSummary;
  switch (intent.kind) {
    case 'stun':
      return 'Stun save';
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

/**
 * If the roll can be sent to `/api/gm`, returns payload; otherwise null (e.g. no session, or gm_request auto-flow).
 */
export function buildGmDiceRollMessage(
  intent: DiceRollIntent | null,
  formula: string,
  total: number,
): { sessionId: string; speakerName: string; playerMessage: string } | null {
  if (!intent || intent.kind === 'gm_request') return null;
  const sessionId = intent.sessionId?.trim();
  if (!sessionId) return null;
  const speaker = intent.speakerName?.trim() || 'Player';
  const label = describeRollForGm(intent, formula);
  if (!label) return null;
  return {
    sessionId,
    speakerName: speaker,
    playerMessage: `${speaker} rolled ${total} for ${label} (${formula})`,
  };
}
