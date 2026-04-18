/**
 * Eligibility for **UI and API** checks (conservative). Postgres UPDATE for `type = 'npc'` also allows
 * any `is_user_in_session(session_id)` participant — see migration `019_npc_update_for_session_participants.sql`.
 * Own row, GM editing NPC in UI, or GM editing an unclaimed PC.
 */
function isUnclaimedUser(userId: string | null | undefined): boolean {
  return userId == null || userId === '';
}

export function characterRowEditableByUser(input: {
  viewerUserId: string;
  characterUserId: string | null | undefined;
  characterType: 'character' | 'npc';
  sessionCreatorId: string | null;
}): boolean {
  if (!isUnclaimedUser(input.characterUserId) && input.characterUserId === input.viewerUserId) return true;
  if (input.characterType === 'npc' && input.sessionCreatorId === input.viewerUserId) return true;
  if (
    input.characterType === 'character' &&
    isUnclaimedUser(input.characterUserId) &&
    input.sessionCreatorId === input.viewerUserId
  ) {
    return true;
  }
  return false;
}
