import { z } from 'zod';

export const NARRATION_TTS_PROVIDER_IDS = ['cartesia', 'chatterbox', 'kokoro', 'omnivoice'] as const;
export type NarrationTtsProviderId = (typeof NARRATION_TTS_PROVIDER_IDS)[number];

const chatterboxSchema = z
  .object({
    useOpenAiEndpoint: z.boolean().optional(),
    voiceMode: z.enum(['predefined', 'clone']).optional(),
    predefinedVoiceId: z.string().optional(),
    referenceAudioFilename: z.string().optional(),
    outputFormat: z.enum(['wav', 'opus']).optional(),
    splitText: z.boolean().optional(),
    /** Chatterbox /tts API accepts 50–500; legacy values are clamped in preprocess. */
    chunkSize: z.preprocess(
      (v) => {
        if (v === undefined || v === null) return undefined;
        if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
        return Math.min(500, Math.max(50, Math.round(v)));
      },
      z.number().int().min(50).max(500).optional(),
    ),
    temperature: z.number().min(0).max(2).optional(),
    exaggeration: z.number().min(0).max(2).optional(),
    cfgWeight: z.number().min(0).max(2).optional(),
    seed: z.number().int().optional(),
    speedFactor: z.number().min(0.25).max(4).optional(),
    language: z.string().max(32).optional(),
    openAiVoice: z.string().max(256).optional(),
    speed: z.number().min(0.5).max(2).optional(),
  })
  .strict();

const kokoroSchema = z
  .object({
    model: z.string().max(64).optional(),
    voice: z.string().max(128).optional(),
    responseFormat: z.enum(['mp3', 'wav']).optional(),
    speed: z.number().min(0.25).max(4).optional(),
    stream: z.boolean().optional(),
    langCode: z.string().max(16).optional(),
    volumeMultiplier: z.number().min(0).max(4).optional(),
  })
  .strict();

/** omnivoice-server: OpenAI-compatible /v1/audio/speech. */
const omnivoiceSchema = z
  .object({
    model: z.string().max(64).optional(),
    voice: z.string().max(256).optional(),
    speaker: z.string().max(256).optional(),
    instructions: z.string().max(2000).optional(),
    /** BCP-47 or omnivoice-server code (e.g. tr, en). Default tr for Turkish table games. */
    language: z.string().max(32).optional(),
    responseFormat: z.enum(['wav', 'pcm']).optional(),
    speed: z.number().min(0.25).max(4).optional(),
    numStep: z.number().int().min(1).max(64).optional(),
    guidanceScale: z.number().min(0).max(10).optional(),
    positionTemperature: z.number().min(0).max(10).optional(),
    classTemperature: z.number().min(0).max(2).optional(),
    denoise: z.boolean().optional(),
    tShift: z.number().min(0).max(2).optional(),
    duration: z.number().min(0.1).max(60).optional(),
    /** If omnivoice-server uses --auth, paste the same token here (stored in session settings). */
    apiKey: z.string().max(512).optional(),
  })
  .strict();

export const narrationTtsClientConfigSchema = z
  .object({
    provider: z.enum(NARRATION_TTS_PROVIDER_IDS),
    /** When false, Cartesia is not used even if `provider` is `cartesia`. */
    useCartesiaCloud: z.boolean().optional(),
    /** Base URL for Chatterbox / Kokoro / omnivoice-server (e.g. http://127.0.0.1:8880). No trailing slash. */
    localBaseUrl: z.string().max(2048).optional(),
    chatterbox: chatterboxSchema.optional(),
    kokoro: kokoroSchema.optional(),
    omnivoice: omnivoiceSchema.optional(),
  })
  .strict();

export type NarrationTtsClientConfig = z.infer<typeof narrationTtsClientConfigSchema>;

export const DEFAULT_NARRATION_TTS_CLIENT_CONFIG: NarrationTtsClientConfig = {
  provider: 'cartesia',
  useCartesiaCloud: true,
  localBaseUrl: '',
  chatterbox: {
    useOpenAiEndpoint: false,
    voiceMode: 'predefined',
    outputFormat: 'wav',
    splitText: true,
    chunkSize: 120,
    speed: 1,
  },
  kokoro: {
    model: 'kokoro',
    voice: 'af_heart',
    responseFormat: 'mp3',
    speed: 1,
    stream: false,
  },
  omnivoice: {
    model: 'omnivoice',
    voice: 'alloy',
    language: 'tr',
    responseFormat: 'wav',
    speed: 1,
    positionTemperature: 0,
  },
};

export function mergeNarrationTtsClientConfig(partial: unknown): NarrationTtsClientConfig {
  const base = DEFAULT_NARRATION_TTS_CLIENT_CONFIG;
  if (typeof partial !== 'object' || partial === null) return base;
  const p = partial as Record<string, unknown>;
  const merged = {
    ...base,
    ...p,
    chatterbox: {
      ...base.chatterbox,
      ...(typeof p.chatterbox === 'object' && p.chatterbox !== null
        ? (p.chatterbox as Record<string, unknown>)
        : {}),
    },
    kokoro: {
      ...base.kokoro,
      ...(typeof p.kokoro === 'object' && p.kokoro !== null ? (p.kokoro as Record<string, unknown>) : {}),
    },
    omnivoice: (() => {
      const o =
        typeof p.omnivoice === 'object' && p.omnivoice !== null
          ? { ...(p.omnivoice as Record<string, unknown>) }
          : {};
      // Legacy: serverProfileDir was a note field only; drop so .strict() parse succeeds
      delete o.serverProfileDir;
      return { ...base.omnivoice, ...o };
    })(),
  };
  const parsed = narrationTtsClientConfigSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  return DEFAULT_NARRATION_TTS_CLIENT_CONFIG;
}

/** Stable fingerprint for cache keys (client + server). */
export function narrationTtsConfigFingerprint(config: NarrationTtsClientConfig): string {
  const normalized = JSON.stringify(sortKeysDeep(config));
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 33) ^ normalized.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeysDeep(o[k]);
  return out;
}

export function encodeNarrationTtsConfigHeader(config: NarrationTtsClientConfig): string {
  const json = JSON.stringify(config);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64: string): string {
  const t = b64.trim();
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(t, 'base64url').toString('utf8');
  }
  const pad = t.length % 4 === 0 ? '' : '='.repeat(4 - (t.length % 4));
  const b64std = t.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64std);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function decodeNarrationTtsConfigHeader(header: string | null): NarrationTtsClientConfig | null {
  if (!header || header.trim().length === 0) return null;
  try {
    const json = base64UrlToUtf8(header);
    const raw = JSON.parse(json) as unknown;
    return mergeNarrationTtsClientConfig(raw);
  } catch {
    return null;
  }
}

export function effectiveNarrationProvider(
  config: NarrationTtsClientConfig,
): NarrationTtsProviderId | null {
  if (config.provider === 'cartesia' && config.useCartesiaCloud === false) return null;
  return config.provider;
}
