import type { SessionSoundtrackState } from '../types';

export const SOUNDTRACK_BUCKET = 'soundtrack';

const AUDIO_RE = /\.(mp3|ogg|opus|wav|m4a|flac)$/i;

export function isSoundtrackAudioFileName(name: string): boolean {
  return name.length > 0 && !name.startsWith('.') && AUDIO_RE.test(name);
}

export function defaultSessionSoundtrackState(): SessionSoundtrackState {
  return {
    ambientPath: '',
    combatPath: '',
    isPlaying: false,
    revision: 0,
  };
}

export function parseSoundtrackStateJson(v: unknown): SessionSoundtrackState | null {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const ambientPath = typeof o.ambientPath === 'string' ? o.ambientPath : '';
  const combatPath = typeof o.combatPath === 'string' ? o.combatPath : '';
  const isPlaying = o.isPlaying === true;
  const revision =
    typeof o.revision === 'number' && Number.isFinite(o.revision) ? Math.max(0, o.revision) : 0;
  return {
    ambientPath,
    combatPath,
    isPlaying,
    revision,
  };
}

export function publicSoundtrackObjectUrl(objectPath: string): string | null {
  const p = objectPath.trim();
  if (!p) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return null;
  const enc = p
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${base}/storage/v1/object/public/${SOUNDTRACK_BUCKET}/${enc}`;
}
