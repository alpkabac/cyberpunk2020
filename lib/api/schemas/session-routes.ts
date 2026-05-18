import { z } from 'zod';

function trimString(val: unknown): unknown {
  return typeof val === 'string' ? val.trim() : val;
}

const uuid = z.preprocess(trimString, z.string().uuid());

/** POST /api/session/chat-message */
export const chatMessagePostBodySchema = z.object({
  sessionId: uuid,
  speaker: z
    .preprocess(trimString, z.string().max(200).optional())
    .transform((s) => (s && s.length > 0 ? s : 'Player')),
  text: z.preprocess(trimString, z.string().min(1).max(120_000)),
  type: z.enum(['player', 'narration', 'roll']).default('player'),
});

export type ChatMessagePostBody = z.infer<typeof chatMessagePostBodySchema>;

/** PATCH /api/session/chat-message */
export const chatMessagePatchBodySchema = z.object({
  sessionId: uuid,
  messageId: uuid,
  text: z.preprocess(trimString, z.string().min(1).max(120_000)),
});

export type ChatMessagePatchBody = z.infer<typeof chatMessagePatchBodySchema>;

/** POST /api/session/chat-messages/truncate */
export const chatMessagesTruncateBodySchema = z.object({
  sessionId: uuid,
  fromMessageId: uuid,
});

export type ChatMessagesTruncateBody = z.infer<typeof chatMessagesTruncateBodySchema>;

/** POST /api/session/[sessionId]/combat */
export const sessionCombatPostBodySchema = z
  .object({
    action: z.enum([
      'start_combat',
      'advance_round',
      'end_combat',
      'next_turn',
      'clear_turn_saves_pending',
      'record_combat_action',
    ]),
    clear_timed_conditions: z.boolean().optional(),
    narration: z.string().max(4000).optional(),
    /** Required when `action` is `record_combat_action`. */
    character_id: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'record_combat_action' && !data.character_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'character_id is required for record_combat_action',
        path: ['character_id'],
      });
    }
  });

export type SessionCombatPostBody = z.infer<typeof sessionCombatPostBodySchema>;
