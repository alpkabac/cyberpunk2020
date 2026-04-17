import type { Character } from '@/lib/types';
import {
  buildGmVoicePlayerMessage,
  buildGmVoicePlayerMessageFromSegments,
} from '@/lib/voice/format-transcription-for-gm';
import type { VoiceSttApiResponse } from '@/lib/voice/voice-api-types';

export type VoiceBlobToMessageResult =
  | { ok: true; playerMessage: string; playerMessageMetadata?: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * POSTs a recorded blob to `/api/voice` and formats the result for the GM (single- or multi-speaker).
 */
export async function voiceBlobToGmPlayerMessage(params: {
  blob: Blob;
  focusCharacterId: string | null;
  speakerName: string;
  charactersById: Record<string, Character>;
  npcsById: Record<string, Character>;
}): Promise<VoiceBlobToMessageResult> {
  const { blob, focusCharacterId, speakerName, charactersById, npcsById } = params;
  if (blob.size < 64) {
    return { ok: false, error: 'Recording too short' };
  }

  const headers: Record<string, string> = {
    'Content-Type': blob.type || 'audio/webm',
  };
  if (focusCharacterId) headers['X-Character-Id'] = focusCharacterId;
  const sttLang = process.env.NEXT_PUBLIC_STT_LANGUAGE?.trim();
  if (sttLang) headers['X-STT-Language'] = sttLang;

  const res = await fetch('/api/voice', { method: 'POST', body: blob, headers });
  const data = (await res.json()) as VoiceSttApiResponse & { error?: string };
  if (!res.ok) {
    return { ok: false, error: data.error ?? res.statusText ?? 'Speech-to-text failed' };
  }
  const text = data.transcript?.trim();
  if (!text) {
    return { ok: false, error: 'No speech detected' };
  }

  const segs = data.segments ?? [];
  if (segs.length <= 1) {
    const cid = segs[0]?.characterId ?? focusCharacterId ?? '';
    if (!cid) {
      return { ok: false, error: 'Select a character before using voice input' };
    }
    const p = buildGmVoicePlayerMessage({
      transcript: text,
      characterId: cid,
      characterDisplayName: speakerName,
    });
    return { ok: true, playerMessage: p.playerMessage, playerMessageMetadata: p.metadata };
  }

  const p = buildGmVoicePlayerMessageFromSegments(
    segs.map((s) => ({
      speaker: s.speaker,
      text: s.text,
      characterId: s.characterId,
    })),
    (id) => {
      const c = charactersById[id] ?? npcsById[id];
      return c?.name ?? id;
    },
  );
  return { ok: true, playerMessage: p.playerMessage, playerMessageMetadata: p.metadata };
}
