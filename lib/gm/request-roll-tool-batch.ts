/**
 * When the model batches `request_roll` (player must roll in the app) with `roll_dice`
 * targeting the same PC, the server would otherwise resolve the check before the human rolls.
 * We suppress those conflicting `roll_dice` calls and nudge the model not to narrate outcomes yet.
 */

import type { Character } from '@/lib/types';
import type { OpenRouterToolCall } from './context-builder';

/** Injected after a tool step that included a successful `request_roll`. */
export const REQUEST_ROLL_FOLLOWUP_USER_MESSAGE =
  'SYSTEM (dice): A player-facing roll was posted to chat. Do not narrate success or failure of that check yet, and do not use `roll_dice` to resolve the same player action—the human rolls in the client. You may still use tools for unrelated things. If nothing else is needed, reply with at most one short line inviting the player to roll, or stay silent.';

function parseJsonArgs(args: string | undefined): Record<string, unknown> {
  if (!args || typeof args !== 'string') return {};
  try {
    const v = JSON.parse(args) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Player character sheets in session (`type === 'character'`). */
function isPlayableCharacterSheet(c: Character | undefined): boolean {
  return Boolean(c && c.type === 'character');
}

/**
 * PC character_ids mentioned in `request_roll` tool calls in this assistant batch.
 * Used to suppress same-batch `roll_dice` for those characters.
 */
export function collectPlayerCharacterIdsFromRequestRollCalls(
  orderedToolCalls: OpenRouterToolCall[],
  charactersById: Map<string, Character>,
): Set<string> {
  const ids = new Set<string>();
  for (const tc of orderedToolCalls) {
    if (tc.function?.name !== 'request_roll') continue;
    const args = parseJsonArgs(tc.function?.arguments);
    const cid = typeof args.character_id === 'string' ? args.character_id.trim() : '';
    if (!cid) continue;
    const ch = charactersById.get(cid);
    if (isPlayableCharacterSheet(ch)) ids.add(cid);
  }
  return ids;
}

/** True if this `roll_dice` should not execute (player must roll instead). */
export function shouldSuppressRollDiceAfterRequestRoll(
  rollDiceArgsJson: string,
  requestRollPcIds: Set<string>,
): boolean {
  if (requestRollPcIds.size === 0) return false;
  const args = parseJsonArgs(rollDiceArgsJson);
  const cid = typeof args.character_id === 'string' ? args.character_id.trim() : '';
  if (!cid) return false;
  return requestRollPcIds.has(cid);
}
