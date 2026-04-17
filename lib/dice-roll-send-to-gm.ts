import type { Character, DiceRollIntent, PendingRollForVoice, PendingVoiceGmPayload, RollResult } from '@/lib/types';
import { fnffAttackTotalMeetsDv } from '@/lib/game-logic/lookups';
import { isFlatSaveSuccess } from '@/lib/game-logic/formulas';

/** Payload for POST `/api/gm` — stun override referee request (no roll). */
export function buildStunOverrideGmPayload(params: {
  character: Character;
  sessionId: string;
  speakerName: string;
  note?: string;
}): {
  sessionId: string;
  speakerName: string;
  playerMessage: string;
  playerMessageMetadata: { kind: 'stun_override_request'; characterId: string };
} {
  const { character: c, sessionId, speakerName, note } = params;
  const wound = c.derivedStats?.woundState ?? 'unknown';
  const stunT = c.derivedStats?.stunSaveTarget ?? c.stats.bt.total;
  const cond = (c.conditions ?? []).map((x) => x.name).join(', ') || '(none)';
  const playerMessage = `[stun_override_request — referee ruling]

**Character:** ${c.name} (\`character_id\`: \`${c.id}\`)
**Snapshot:** isStunned **${c.isStunned}**, wound **${wound}**, damage **${c.damage}**/41, stun-save target **≤${stunT}** (flat d10), stabilized **${c.isStabilized}**, conditions: ${cond}

The player asks you to **rule whether STUNNED should change** for this character (fiction, drugs, cyber, referee fiat). Default to **CP2020** unless the table clearly agrees to override.

**Player note (optional):**
${note?.trim() ? note.trim() : '_(none — use sheet + context only)_' }

**Required:** If you change the ruling, **apply it** with tool \`set_condition\`: \`condition\` = \`"stunned"\`, \`active\` = true or false (toggles \`isStunned\` only). Then narrate briefly.`;

  return {
    sessionId,
    speakerName,
    playerMessage,
    playerMessageMetadata: { kind: 'stun_override_request', characterId: c.id },
  };
}

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
  if (intent.kind === 'custom') return intent.rollSummary;
  if ('rollSummary' in intent && intent.rollSummary) return intent.rollSummary;
  switch (intent.kind) {
    case 'stun':
      return 'Stun save';
    case 'stun_recovery':
      return 'Stun recovery';
    case 'stun_override_request':
      return 'Stun override request';
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
 * If the roll can be sent to `/api/gm`, returns payload; otherwise null (e.g. no session).
 */
export function buildGmDiceRollMessage(
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
      playerMessage: `[Roll] ${formula} = ${result.total} (dice: ${result.rolls.join(', ')}) — ${label}`,
    };
  }

  const sessionId = intent.sessionId?.trim();
  if (!sessionId) return null;
  const speaker = intent.speakerName?.trim() || 'Player';
  const label = describeRollForGm(intent, formula);
  if (!label) return null;

  if (intent.kind === 'attack' && typeof intent.difficultyValue === 'number') {
    const hit = fnffAttackTotalMeetsDv(result.total, intent.difficultyValue);
    const tgt = intent.targetName?.trim();
    const tgtPart = tgt ? ` vs **${tgt}**` : '';
    const dv = intent.difficultyValue;
    const bracket =
      intent.rangeBracketLabel?.trim() && intent.rangeBracketLabel.trim().length > 0
        ? ` · ${intent.rangeBracketLabel.trim()}`
        : '';
    return {
      sessionId,
      speakerName: speaker,
      playerMessage: `${speaker} rolled **${result.total}** for ${label}${tgtPart}${bracket} — **${hit ? 'HIT' : 'MISS'}** vs DV **${dv}** (${formula})`,
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
          : '**DIED** (failed death save — damage set to 41)'
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
      playerMessage: `${speaker} rolled **${result.total}** for ${label} — FNFF: need **≤${saveTarget}** on flat d10 — ${outcome} (${formula})`,
    };
  }

  return {
    sessionId,
    speakerName: speaker,
    playerMessage: `${speaker} rolled ${result.total} for ${label} (${formula})`,
  };
}

function segmentTimeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Interleaves voice and rolls by wall-clock (`rolledAtMs` vs voice recording start / STT time).
 * Each block is prefixed with `[local time] Voice|Roll` so the GM sees order of events.
 */
export function mergeVoiceAndQueuedRollsChronologically(params: {
  voice: Pick<
    PendingVoiceGmPayload,
    'playerMessage' | 'playerMessageMetadata' | 'recordingStartedAtMs' | 'sttCompletedAtMs'
  >;
  rolls: Array<{ rolledAtMs: number; playerMessage: string }>;
}): { playerMessage: string; playerMessageMetadata?: Record<string, unknown> } {
  const { voice, rolls } = params;
  const voiceAnchor = voice.recordingStartedAtMs ?? voice.sttCompletedAtMs ?? Date.now();
  const voiceText = voice.playerMessage.trim();
  type Seg = { t: number; kind: 'voice' | 'roll'; body: string };
  const segments: Seg[] = [
    { t: voiceAnchor, kind: 'voice', body: voiceText },
    ...rolls.map((r) => ({
      t: r.rolledAtMs,
      kind: 'roll' as const,
      body: r.playerMessage.trim(),
    })),
  ];
  segments.sort((a, b) => a.t - b.t);
  const lines = segments.map((s) => {
    const time = segmentTimeLabel(s.t);
    const kind = s.kind === 'voice' ? 'Voice' : 'Roll';
    return `[${time}] ${kind}\n${s.body}`;
  });
  return {
    playerMessage: lines.join('\n\n'),
    playerMessageMetadata: {
      mergedVoiceAndRolls: true as const,
      chronological: true as const,
      voice: voice.playerMessageMetadata,
    },
  };
}

/** Session voice + all rolls saved for voice (same session). */
export function mergePendingVoiceWithQueuedRolls(
  voice: PendingVoiceGmPayload,
  rolls: PendingRollForVoice[],
): { playerMessage: string; playerMessageMetadata?: Record<string, unknown> } {
  const forSession = rolls.filter((r) => r.sessionId === voice.sessionId);
  return mergeVoiceAndQueuedRollsChronologically({
    voice,
    rolls: forSession.map((r) => ({ rolledAtMs: r.rolledAtMs, playerMessage: r.playerMessage })),
  });
}

/** Pending voice + one roll ("Send now" from dice while voice is queued). */
export function mergeVoiceWithSingleRollForGm(
  voice: PendingVoiceGmPayload,
  rollPlayerMessage: string,
  rolledAtMs: number,
): { playerMessage: string; playerMessageMetadata?: Record<string, unknown> } {
  return mergeVoiceAndQueuedRollsChronologically({
    voice,
    rolls: [{ rolledAtMs, playerMessage: rollPlayerMessage }],
  });
}
