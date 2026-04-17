import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { characterRowEditableByUser } from '@/lib/auth/character-edit-policy';

/**
 * Player voice may attribute to their own PC or (if GM) an NPC in the session.
 * `characterId === null` is allowed (e.g. group / undifferentiated turn).
 */
export async function assertPlayerVoiceCharacterAllowed(
  admin: SupabaseClient,
  sessionId: string,
  characterId: string | null,
  userId: string,
): Promise<NextResponse | null> {
  if (!characterId) return null;

  const { data: sessionRow } = await admin.from('sessions').select('created_by').eq('id', sessionId).maybeSingle();
  const sessionCreatorId = sessionRow?.created_by ?? null;

  const { data: ch, error } = await admin
    .from('characters')
    .select('session_id, user_id, type')
    .eq('id', characterId)
    .maybeSingle();

  if (error || !ch || ch.session_id !== sessionId) {
    return NextResponse.json({ error: 'Character not in this session' }, { status: 403 });
  }

  const type = ch.type === 'npc' ? 'npc' : 'character';
  const allowed = characterRowEditableByUser({
    viewerUserId: userId,
    characterUserId: ch.user_id,
    characterType: type,
    sessionCreatorId,
  });

  if (!allowed) {
    return NextResponse.json({ error: 'Not allowed to send voice as this character' }, { status: 403 });
  }

  return null;
}
