import type { SupabaseClient } from '@supabase/supabase-js';

export const CHARACTER_AVATARS_BUCKET = 'avatars';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function extensionForFile(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) {
    if (fromName === 'jpg') return 'jpg';
    return fromName;
  }
  const t = file.type;
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/gif') return 'gif';
  return 'img';
}

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return 'Use PNG, JPEG, WebP, or GIF.';
  }
  if (file.size > MAX_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
}

/**
 * Upload a portrait to Storage at `{sessionId}/{characterId}/{uuid}.{ext}`.
 * Requires bucket `avatars` and matching RLS (see migrations/014_storage_avatars_bucket.sql).
 */
export async function uploadCharacterAvatar(
  client: SupabaseClient,
  opts: { sessionId: string; characterId: string; file: File },
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const v = validateAvatarFile(opts.file);
  if (v) return { publicUrl: null, error: new Error(v) };

  const ext = extensionForFile(opts.file);
  const path = `${opts.sessionId}/${opts.characterId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await client.storage
    .from(CHARACTER_AVATARS_BUCKET)
    .upload(path, opts.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: opts.file.type || undefined,
    });

  if (upErr) return { publicUrl: null, error: new Error(upErr.message) };

  const { data } = client.storage.from(CHARACTER_AVATARS_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, error: null };
}

/** Keep map tokens in sync when the character portrait URL changes. */
export async function syncMapTokensPortrait(
  client: SupabaseClient,
  sessionId: string,
  characterId: string,
  imageUrl: string,
): Promise<{ error: Error | null }> {
  const { error } = await client
    .from('tokens')
    .update({ image_url: imageUrl })
    .eq('session_id', sessionId)
    .eq('character_id', characterId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
