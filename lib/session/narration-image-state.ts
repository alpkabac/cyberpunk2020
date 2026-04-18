import type { SessionNarrationImage } from '../types';

export function parseNarrationImageJson(v: unknown): SessionNarrationImage | null {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const url = typeof o.url === 'string' ? o.url.trim() : '';
  if (!url) return null;
  const capRaw = o.caption;
  const caption =
    capRaw != null && typeof capRaw === 'string'
      ? capRaw.trim().slice(0, 280) || null
      : null;
  const revision =
    typeof o.revision === 'number' && Number.isFinite(o.revision) ? Math.max(0, Math.floor(o.revision)) : 0;
  return { url, caption, revision };
}
