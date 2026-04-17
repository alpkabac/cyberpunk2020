import { NextResponse } from 'next/server';
import { chatMessagesTruncateBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { fetchSessionSnapshot } from '@/lib/realtime/session-load';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { sliceFromMessageInclusive } from '@/lib/session/chat-mutations';

export async function POST(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = chatMessagesTruncateBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/session/chat-messages/truncate');
  }

  const { sessionId, fromMessageId } = parsed.data;
  const supabase = getServiceRoleClient();

  if (!(await userHasSessionAccess(supabase, sessionId, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const snapshot = await fetchSessionSnapshot(supabase, sessionId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const tail = sliceFromMessageInclusive(snapshot.chatMessages, fromMessageId);
  if (!tail || tail.length === 0) {
    return NextResponse.json({ error: 'Message not found in session' }, { status: 404 });
  }

  const deletedIds = tail.map((m) => m.id);
  const { error: delErr } = await supabase.from('chat_messages').delete().in('id', deletedIds);

  if (delErr) {
    reportServerError('api/session/chat-messages/truncate', new Error(delErr.message), {
      sessionId,
      count: deletedIds.length,
    });
    return NextResponse.json({ error: 'Failed to truncate chat' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedIds });
}
