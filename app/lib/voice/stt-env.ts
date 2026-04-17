/**
 * Server-side STT credentials. Prefer DEEPGRAM_API_KEY; STT_API_KEY is a generic alias.
 */
export function getDeepgramApiKeyFromEnv(): string | undefined {
  const a = process.env.DEEPGRAM_API_KEY?.trim();
  if (a) return a;
  return process.env.STT_API_KEY?.trim() || undefined;
}
