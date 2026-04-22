import { createHash } from 'crypto';

export const CHATTERBOX_NPC_VOICE_MEMORY_MAX_KEYS = 256;

function sortMemoryKeys(m: Record<string, number>): Record<string, number> {
  const keys = Object.keys(m).sort();
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = m[k]!;
  return out;
}

/**
 * Fingerprint for TTS cache keys: list-order memory affects Chatterbox output per name.
 */
export function chatterboxVoiceMemoryFingerprint(memory: Record<string, number> | undefined): string {
  if (!memory || Object.keys(memory).length === 0) return '0';
  const s = JSON.stringify(sortMemoryKeys(memory));
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 20);
}

export function voiceMemoryShallowEqual(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): boolean {
  const ak = a ? Object.keys(a) : [];
  const bk = b ? Object.keys(b) : [];
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a![k] !== b![k]) return false;
  }
  return true;
}

/**
 * When memory is at capacity, pick a slot deterministically without growing the map.
 */
export function slotForOverflowingVoiceMemory(nameKey: string, rulesLen: number): number {
  if (rulesLen <= 0) return 0;
  let h = 5381;
  for (let i = 0; i < nameKey.length; i++) h = (h * 33) ^ nameKey.charCodeAt(i);
  return Math.abs(h) % rulesLen;
}
