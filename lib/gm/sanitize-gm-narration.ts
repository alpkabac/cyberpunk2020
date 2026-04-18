/**
 * Some models leak pseudo–tool-call XML into `message.content`. That text is shown to
 * players as GM narration — strip it before persisting or displaying.
 */

const CLOSED_FUNCTION_CALLS = /<function_calls\b[^>]*>[\s\S]*?<\/function_calls>/gi;
const CLOSED_INVOKE = /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi;
const UNCLOSED_FUNCTION_CALLS = /<function_calls\b[^>]*>[\s\S]*/i;

/**
 * Removes leaked tool-markup fragments from GM-facing narration.
 */
export function sanitizeGmNarrationText(text: string): string {
  let s = text.replace(CLOSED_FUNCTION_CALLS, '');
  s = s.replace(CLOSED_INVOKE, '');
  const unclosed = UNCLOSED_FUNCTION_CALLS.exec(s);
  if (unclosed) {
    s = s.slice(0, unclosed.index).trimEnd();
  }
  return s.replace(/\n{3,}/g, '\n\n').trim();
}
