import { z } from 'zod';

function trimString(val: unknown): unknown {
  return typeof val === 'string' ? val.trim() : val;
}

const uuid = z.preprocess(trimString, z.string().uuid());

const pendingRollSchema = z.object({
  rolledAtMs: z.number().finite(),
  playerMessage: z.string().min(1).max(20_000),
});

/** POST /api/gm */
export const gmPostBodySchema = z.object({
  sessionId: uuid,
  playerMessage: z.preprocess(trimString, z.string().min(1).max(120_000)),
  speakerName: z
    .preprocess(trimString, z.string().max(200).optional())
    .transform((s) => (s && s.length > 0 ? s : 'Player')),
  playerMessageMetadata: z.record(z.string(), z.unknown()).optional(),
  loreTokenBudget: z.number().int().positive().max(50_000).optional(),
});

export type GmPostBody = z.infer<typeof gmPostBodySchema>;

/** POST /api/session/voice-turn/merge */
export const voiceTurnMergeBodySchema = z.object({
  sessionId: uuid,
  turnId: z.preprocess(trimString, z.string().min(1).max(128)),
});

export type VoiceTurnMergeBody = z.infer<typeof voiceTurnMergeBodySchema>;

/** POST /api/session/voice-turn/fragment */
export const voiceTurnFragmentBodySchema = z.object({
  sessionId: uuid,
  turnId: z.preprocess(trimString, z.string().min(1).max(128)),
  userId: uuid,
  speakerName: z
    .preprocess(trimString, z.string().max(200).optional())
    .transform((s) => (s && s.length > 0 ? s : 'Player')),
  characterId: z.preprocess((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') {
      const t = v.trim();
      return t.length === 0 ? null : t;
    }
    return v;
  }, z.union([uuid, z.null()])),
  playerMessage: z.preprocess(trimString, z.string().min(1).max(120_000)),
  playerMessageMetadata: z.record(z.string(), z.unknown()).optional(),
  anchorMs: z.number().finite(),
  pendingRolls: z.array(pendingRollSchema).max(100).optional(),
});

export type VoiceTurnFragmentBody = z.infer<typeof voiceTurnFragmentBodySchema>;

/** Resolved language tag for POST /api/voice (after header / query / env / default). */
export const voiceSttLanguageSchema = z
  .string()
  .max(32)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/, 'Expected BCP-47 language tag');
