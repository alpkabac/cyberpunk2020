import type { SupabaseClient } from '@supabase/supabase-js';

export const NARRATION_TTS_AUDIO_BUCKET = 'narration-tts';

const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 days (broadcast may be processed late)

function extensionForMime(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  return 'wav';
}

/**
 * Upload narration audio for a chat message; returns a time-limited signed URL for playback.
 * Path: `{sessionId}/{messageId}.{ext}` (upsert).
 */
export async function uploadNarrationTtsForMessage(
  supabase: SupabaseClient,
  opts: { sessionId: string; messageId: string; buffer: Buffer; mimeType: string },
): Promise<{ audioUrl: string | null; error: Error | null }> {
  const ext = extensionForMime(opts.mimeType);
  const path = `${opts.sessionId}/${opts.messageId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(NARRATION_TTS_AUDIO_BUCKET)
    .upload(path, opts.buffer, {
      contentType: opts.mimeType,
      upsert: true,
      cacheControl: '3600',
    });

  if (upErr) return { audioUrl: null, error: new Error(upErr.message) };

  const { data, error: signErr } = await supabase.storage
    .from(NARRATION_TTS_AUDIO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (signErr || !data?.signedUrl) {
    return { audioUrl: null, error: new Error(signErr?.message ?? 'Signed URL failed') };
  }
  return { audioUrl: data.signedUrl, error: null };
}
