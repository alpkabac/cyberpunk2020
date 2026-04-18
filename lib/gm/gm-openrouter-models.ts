/**
 * AI-GM OpenRouter models exposed in the client selector (official `model` ids only).
 * DeepSeek V3.2 “thinking” mode uses the same id with OpenRouter `reasoning` on the request body.
 */

export const GM_SELECTABLE_OPENROUTER_MODEL_IDS = [
  'z-ai/glm-4.6',
  'z-ai/glm-4.7',
  'z-ai/glm-5',
  'deepseek/deepseek-v3.2',
  'moonshotai/kimi-k2',
] as const;

export type GmSelectableOpenRouterModelId = (typeof GM_SELECTABLE_OPENROUTER_MODEL_IDS)[number];

const ALLOWED = new Set<string>(GM_SELECTABLE_OPENROUTER_MODEL_IDS);

export function isGmSelectableOpenRouterModelId(id: string): id is GmSelectableOpenRouterModelId {
  return ALLOWED.has(id);
}

export type ResolvedGmOpenRouterCall = {
  model: string;
  /** Passed to OpenRouter chat/completions when set (e.g. DeepSeek V3.2 thinking). */
  reasoning?: { effort: 'high' };
};

export function defaultGmOpenRouterEnvModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-v3.2';
}

/**
 * Picks the OpenRouter `model` and optional `reasoning` object from client body + env default.
 * Unknown client model ids are ignored (env default used).
 */
export function resolveGmOpenRouterCall(
  clientModel: string | undefined,
  envModel: string,
): ResolvedGmOpenRouterCall {
  const fallback = envModel.trim() || 'deepseek/deepseek-v3.2';
  const trimmed = clientModel?.trim();
  const model =
    trimmed && isGmSelectableOpenRouterModelId(trimmed) ? trimmed : fallback;
  if (model === 'deepseek/deepseek-v3.2') {
    return { model, reasoning: { effort: 'high' } };
  }
  return { model };
}
