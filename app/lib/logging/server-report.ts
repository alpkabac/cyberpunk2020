/**
 * Central server-side error / diagnostic logging. Prefer this over raw console.error in API routes.
 * Logs one JSON line per event (easy to ship to log aggregators). To use Sentry, call it from
 * your own wrapper or add @sentry/node and captureException alongside reportServerError.
 */

function serializeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
}

export function reportServerError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const payload = {
    level: 'error' as const,
    scope,
    ...serializeError(error),
    ...context,
    time: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
}

export function reportServerWarning(scope: string, message: string, context?: Record<string, unknown>): void {
  console.warn(JSON.stringify({ level: 'warn', scope, message, ...context, time: new Date().toISOString() }));
}
