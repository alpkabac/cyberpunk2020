/**
 * Parses `Authorization: Bearer <token>` (case-insensitive scheme, trimmed token).
 */
export function parseBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader == null) return null;
  const m = authorizationHeader.match(/^\s*Bearer\s+(\S+)\s*$/i);
  const t = m?.[1];
  return t && t.length > 0 ? t : null;
}
