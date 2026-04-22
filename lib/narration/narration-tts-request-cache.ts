import type { SupabaseClient } from '@supabase/supabase-js';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { getSessionNarrationTtsConfig } from '@/lib/session/session-narration-tts-config';
import { fetchSessionSettings } from '@/lib/session/fetch-session-settings';
import { mergeNarrationTtsClientConfig } from '@/lib/narration/narration-tts-client-config';
import type { NarrationTtsClientConfig } from './narration-tts-client-config';

/** POST /api/session/narration-tts can fire many times per GM stream; avoid re-querying Supabase every chunk. */
const CONFIG_TTL_MS = 10_000;
const ACCESS_TTL_MS = 15_000;
const MAX_ENTRIES = 128;

type Timed<T> = { v: T; exp: number };

const configBySession = new Map<string, Timed<NarrationTtsClientConfig>>();
const accessByKey = new Map<string, Timed<boolean>>();

export type NarrationTtsSynthesisContext = {
  config: NarrationTtsClientConfig;
  memory: Record<string, number>;
};

const synthesisBySession = new Map<string, Timed<NarrationTtsSynthesisContext>>();

function pruneOldest<K, V>(m: Map<K, V>) {
  if (m.size <= MAX_ENTRIES) return;
  const first = m.keys().next().value;
  if (first !== undefined) m.delete(first);
}

/**
 * Cached session membership check for TTS routes (short TTL — not a security boundary).
 */
export async function narrationTtsCachedAccess(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const key = `${sessionId}:${userId}`;
  const now = Date.now();
  const hit = accessByKey.get(key);
  if (hit && hit.exp > now) return hit.v;
  const v = await userHasSessionAccess(supabase, sessionId, userId);
  accessByKey.set(key, { v, exp: now + ACCESS_TTL_MS });
  pruneOldest(accessByKey);
  return v;
}

/**
 * Cached narration TTS settings from `sessions.settings` (voice, provider, Chatterbox URL, etc.).
 */
export async function narrationTtsCachedConfig(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<NarrationTtsClientConfig> {
  const now = Date.now();
  const hit = configBySession.get(sessionId);
  if (hit && hit.exp > now) return hit.v;
  const v = await getSessionNarrationTtsConfig(supabase, sessionId);
  configBySession.set(sessionId, { v, exp: now + CONFIG_TTL_MS });
  pruneOldest(configBySession);
  return v;
}

/**
 * Config + Chatterbox list-order memory (invalidated when `chatterboxNpcVoiceMemory` is written).
 */
export async function narrationTtsCachedSynthesisContext(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<NarrationTtsSynthesisContext> {
  const now = Date.now();
  const hit = synthesisBySession.get(sessionId);
  if (hit && hit.exp > now) return hit.v;
  const settings = await fetchSessionSettings(supabase, sessionId);
  const v: NarrationTtsSynthesisContext = {
    config: mergeNarrationTtsClientConfig(settings.narrationTts),
    memory: { ...settings.chatterboxNpcVoiceMemory },
  };
  synthesisBySession.set(sessionId, { v, exp: now + CONFIG_TTL_MS });
  pruneOldest(synthesisBySession);
  return v;
}

export function invalidateNarrationTtsSessionCache(sessionId: string): void {
  configBySession.delete(sessionId);
  synthesisBySession.delete(sessionId);
}
