import type { NarrationTtsClientConfig } from './narration-tts-client-config';

/** Match `synthesizeOmnivoiceNarration` / omnivoice-server (OpenAI-style body). */
export const OMNIVOICE_SPLIT_AT_CHARS = 1600;

/**
 * One POST /v1/audio/speech body. `transcript` is a single part (no chunking here).
 */
export function buildOmnivoiceSpeechRequestBody(
  transcript: string,
  o: NonNullable<NarrationTtsClientConfig['omnivoice']> | undefined,
  responseFormat: 'wav' | 'pcm',
): Record<string, unknown> {
  const voice = o?.voice?.trim() || 'alloy';
  const model = o?.model?.trim() || 'omnivoice';
  const body: Record<string, unknown> = {
    model,
    input: transcript,
    voice,
    response_format: responseFormat,
    stream: false,
    speed: typeof o?.speed === 'number' && Number.isFinite(o.speed) ? o.speed : 1,
    language: o?.language?.trim() || 'tr',
  };

  if (o?.speaker?.trim()) body.speaker = o.speaker.trim();
  if (o?.instructions?.trim()) body.instructions = o.instructions.trim();

  if (typeof o?.numStep === 'number' && Number.isFinite(o.numStep)) body.num_step = o.numStep;
  if (typeof o?.guidanceScale === 'number' && Number.isFinite(o.guidanceScale)) {
    body.guidance_scale = o.guidanceScale;
  }
  if (typeof o?.positionTemperature === 'number' && Number.isFinite(o.positionTemperature)) {
    body.position_temperature = o.positionTemperature;
  }
  if (typeof o?.classTemperature === 'number' && Number.isFinite(o.classTemperature)) {
    body.class_temperature = o.classTemperature;
  }
  if (typeof o?.denoise === 'boolean') body.denoise = o.denoise;
  if (typeof o?.tShift === 'number' && Number.isFinite(o.tShift)) body.t_shift = o.tShift;
  if (typeof o?.duration === 'number' && Number.isFinite(o.duration)) body.duration = o.duration;

  return body;
}
