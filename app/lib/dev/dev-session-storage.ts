/**
 * Persists the active dev/test session id in localStorage so /dev, /gm-scenarios, and
 * Open session room survive refresh without re-pasting UUIDs.
 */

export const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SESSION_KEY = 'cp2020-dev-session-id';
const SPEAKER_KEY = 'cp2020-dev-speaker-name';

export function isValidSessionUuid(s: string): boolean {
  return SESSION_ID_RE.test(s.trim());
}

export function getDevSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(SESSION_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function setDevSessionId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const t = id.trim();
    if (!t) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, t);
  } catch {
    /* ignore quota / private mode */
  }
}

export function getDevSpeakerName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(SPEAKER_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function setDevSpeakerName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const t = name.trim();
    if (!t) {
      localStorage.removeItem(SPEAKER_KEY);
      return;
    }
    localStorage.setItem(SPEAKER_KEY, t);
  } catch {
    /* ignore */
  }
}
