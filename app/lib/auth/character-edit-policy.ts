/**
 * Pure mirror of characters UPDATE RLS: own row or GM editing NPC in that session.
 */
export function characterRowEditableByUser(input: {
  viewerUserId: string;
  characterUserId: string | null;
  characterType: 'character' | 'npc';
  sessionCreatorId: string | null;
}): boolean {
  if (input.characterUserId === input.viewerUserId) return true;
  if (input.characterType === 'npc' && input.sessionCreatorId === input.viewerUserId) return true;
  return false;
}
