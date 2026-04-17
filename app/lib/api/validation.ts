import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reportServerWarning } from '@/lib/logging/server-report';

export function validationErrorResponse(error: z.ZodError, logScope?: string): NextResponse {
  if (logScope) {
    reportServerWarning(logScope, 'request validation failed', { issueCount: error.issues.length });
  }
  return NextResponse.json(
    {
      error: 'Validation failed',
      issues: error.issues.map((i) => ({
        path: i.path.map(String).join('.') || '(root)',
        message: i.message,
        code: i.code,
      })),
    },
    { status: 422 },
  );
}

export async function readJsonBody(request: Request): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }
> {
  try {
    const data: unknown = await request.json();
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
}
