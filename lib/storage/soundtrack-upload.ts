import type { SupabaseClient } from '@supabase/supabase-js';
import { SOUNDTRACK_BUCKET, isSoundtrackAudioFileName } from '@/lib/session/soundtrack-state';

export type SoundtrackUploadMode = 'ambient' | 'combat';

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_NAME_LEN = 200;

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/x-flac',
  'audio/flac',
  'audio/webm',
  'audio/x-ms-wma',
  'application/ogg',
]);

/** Strip any path, limit characters, and keep a safe basename for `ambient/…` or `combat/…`. */
export function safeSoundtrackObjectName(originalName: string): string {
  const base = (originalName.split(/[/\\]/).pop() ?? 'track').trim() || 'track';
  const noDots = base.replace(/^\./, '_');
  const safe = noDots.replace(/[^\w.\- ()+&!#[\]]/g, '_');
  return safe.length > MAX_NAME_LEN ? safe.slice(0, MAX_NAME_LEN) : safe;
}

export function validateSoundtrackFile(file: File): string | null {
  if (file.size > MAX_BYTES) {
    return 'File must be 100 MB or smaller.';
  }
  if (file.type && !ALLOWED_MIME.has(file.type) && !file.type.startsWith('audio/')) {
    return 'Pick an audio file (MP3, OGG, WAV, FLAC, M4A, etc.).';
  }
  const name = safeSoundtrackObjectName(file.name);
  if (!isSoundtrackAudioFileName(name)) {
    return 'Use a known audio extension: .mp3, .ogg, .opus, .wav, .m4a, .flac';
  }
  return null;
}

export async function uploadSoundtrackFile(
  client: SupabaseClient,
  opts: { mode: SoundtrackUploadMode; file: File; upsert?: boolean },
): Promise<{ objectPath: string; error: Error | null }> {
  const v = validateSoundtrackFile(opts.file);
  if (v) return { objectPath: '', error: new Error(v) };

  const name = safeSoundtrackObjectName(opts.file.name);
  if (!isSoundtrackAudioFileName(name)) {
    return { objectPath: '', error: new Error('Invalid file name after sanitization.') };
  }

  const objectPath = `${opts.mode}/${name}`;
  const { error: upErr } = await client.storage.from(SOUNDTRACK_BUCKET).upload(objectPath, opts.file, {
    cacheControl: '3600',
    upsert: opts.upsert !== false,
    contentType: opts.file.type || undefined,
  });

  if (upErr) return { objectPath: '', error: new Error(upErr.message) };
  return { objectPath, error: null };
}
