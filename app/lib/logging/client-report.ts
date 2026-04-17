/**
 * Browser-side structured logging (Realtime, sync hooks). Keep payloads small — no secrets.
 */

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
}

export function reportClientError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(
    JSON.stringify({
      level: 'error',
      scope,
      ...serializeError(error),
      ...context,
      time: new Date().toISOString(),
    }),
  );
}
