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

function getNanoGptApiKeyFromEnv(): string {
  return normalizeOpenRouterApiKey(process.env.CP2020_NANOGPT_API_KEY ?? '');
}

/**
 * **OpenAI-compatible** chat/completions for the AI-GM. Default: OpenRouter; optional: NanoGPT
 * (https://nano-gpt.com/api/v1) when `CP2020_NANOGPT_API_KEY` is set.
 *
 * - If `CP2020_PREFER_NANOGPT_LLM=1` and a NanoGPT key is present, that wins when both are set.
 * - If only one key is set, that provider is used.
 */
export type GmLlmConfig = {
  kind: 'openrouter' | 'nanogpt';
  apiKey: string;
  /** Full URL to `POST` .../chat/completions */
  chatCompletionsUrl: string;
};

export function getGmLlmConfig(): GmLlmConfig | null {
  const nKey = getNanoGptApiKeyFromEnv();
  const oKey = getOpenRouterApiKeyFromEnv();
  const preferNanogpt = process.env.CP2020_PREFER_NANOGPT_LLM?.trim() === '1';
  const base = (process.env.CP2020_NANOGPT_BASE_URL?.trim() || 'https://nano-gpt.com/api/v1').replace(
    /\/$/,
    '',
  );
  const chatCompletionsUrl = `${base}/chat/completions`;

  if (preferNanogpt && nKey) {
    return { kind: 'nanogpt', apiKey: nKey, chatCompletionsUrl };
  }
  if (oKey) {
    return {
      kind: 'openrouter',
      apiKey: oKey,
      chatCompletionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
    };
  }
  if (nKey) {
    return { kind: 'nanogpt', apiKey: nKey, chatCompletionsUrl };
  }
  return null;
}

/** Error body for 503 when neither OpenRouter nor NanoGPT is configured. */
export function getGmLlmKeyMissingError(): string {
  return (
    'Set CP2020_OPENROUTER_API_KEY in app/.env.local (recommended), or CP2020_NANOGPT_API_KEY for the NanoGPT API. ' +
    'Legacy: OPENROUTER_API_KEY or OPENROUTER_KEY. If both are set, OpenRouter is used unless CP2020_PREFER_NANOGPT_LLM=1.'
  );
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
