/**
 * Session creator–only actions (e.g. delete session), matching sessions DELETE RLS.
 */
export function sessionCreatorActionAuthorized(viewerUserId: string, sessionCreatorId: string | null): boolean {
  return sessionCreatorId != null && viewerUserId === sessionCreatorId;
}
