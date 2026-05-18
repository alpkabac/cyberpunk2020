export type ChatMessagePostType = 'player' | 'narration' | 'roll';

export function canPostSessionChatMessage(params: {
  hasSessionAccess: boolean;
  isSessionGm: boolean;
  type: ChatMessagePostType;
}): boolean {
  if (!params.hasSessionAccess) return false;
  if (params.type === 'narration') return params.isSessionGm;
  return true;
}
