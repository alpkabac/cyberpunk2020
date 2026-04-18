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

/**
 * Max estimated tokens for system + user + tool schema on the **first** OpenRouter
 * `chat/completions` call. Default leaves room on typical 128k models for tool rounds
 * and output; override if you use a smaller-context model.
 */
export function getGmMaxInputTokensFromEnv(): number {
  const raw = process.env.CP2020_GM_MAX_INPUT_TOKENS?.trim();
  if (!raw) return 100_000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 4000 ? n : 100_000;
}

/** Upper bound on tail chat messages considered before token trimming (default 40). */
export function getGmMaxChatMessagesFromEnv(): number {
  const raw = process.env.CP2020_GM_MAX_CHAT_MESSAGES?.trim();
  if (!raw) return 40;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(500, Math.max(1, n)) : 40;
}
