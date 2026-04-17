import { NextResponse } from 'next/server';
import { chatMessagePatchBodySchema } from '@/lib/api/schemas/session-routes';
import { readJsonBody, validationErrorResponse } from '@/lib/api/validation';
import { requireAuthFromRequest } from '@/lib/auth/require-auth';
import { userHasSessionAccess } from '@/lib/auth/session-access';
import { chatRowToMessage } from '@/lib/realtime/db-mapper';
import { reportServerError } from '@/lib/logging/server-report';
import { getServiceRoleClient } from '@/lib/supabase';
import { z } from 'zod';

const uuid = z.string().uuid();

export async function PATCH(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = chatMessagePatchBodySchema.safeParse(rawBody.data);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error, 'api/session/chat-message:patch');
  }

  const { sessionId, messageId, text } = parsed.data;
  const supabase = getServiceRoleClient();

  const allowed = await userHasSessionAccess(supabase, sessionId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from('chat_messages')
    .select('id, type, session_id')
    .eq('id', messageId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  if ((row as { type?: string }).type !== 'player') {
    return NextResponse.json({ error: 'Only player messages can be edited' }, { status: 400 });
  }

  const { data: updated, error: updErr } = await supabase
    .from('chat_messages')
    .update({ text })
    .eq('id', messageId)
    .eq('session_id', sessionId)
    .select('*')
    .single();

  if (updErr || !updated) {
    reportServerError(
      'api/session/chat-message:patch',
      new Error(updErr?.message ?? 'update returned no row'),
      { sessionId, messageId },
    );
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: chatRowToMessage(updated as Record<string, unknown>),
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAuthFromRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sessionIdRaw = url.searchParams.get('sessionId');
  const messageIdRaw = url.searchParams.get('messageId');
  const sessionId = uuid.safeParse(sessionIdRaw);
  const messageId = uuid.safeParse(messageIdRaw);
  if (!sessionId.success || !messageId.success) {
    return NextResponse.json({ error: 'sessionId and messageId (uuid) required' }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  if (!(await userHasSessionAccess(supabase, sessionId.data, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: row } = await supabase
    .from('chat_messages')
    .select('id')
    .eq('id', messageId.data)
    .eq('session_id', sessionId.data)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', messageId.data)
    .eq('session_id', sessionId.data);

  if (delErr) {
    reportServerError('api/session/chat-message:delete', new Error(delErr.message), {
      sessionId: sessionId.data,
      messageId: messageId.data,
    });
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedId: messageId.data });
}
