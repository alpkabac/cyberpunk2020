/**
 * Resolve OpenRouter API key from env.
 *
 * **Primary:** `CP2020_OPENROUTER_API_KEY` — avoids Windows User/System `OPENROUTER_API_KEY`
 * shadowing `.env.local` (Next.js keeps existing OS env vars).
 *
 * **Fallback:** `OPENROUTER_API_KEY`, `OPENROUTER_KEY` for older configs.
 */

/** Strip BOM, CRLF, quotes, and accidental `Bearer ` prefix. */
export function normalizeOpenRouterApiKey(raw: string): string {
  let t = raw.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}

export function getOpenRouterApiKeyFromEnv(): string {
  const raw =
    process.env.CP2020_OPENROUTER_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    process.env.OPENROUTER_KEY ??
    '';
  return normalizeOpenRouterApiKey(raw);
}
