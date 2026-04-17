-- Multiplayer session voice: each client posts STT text + optional saved rolls; merge API builds one GM message.

CREATE TABLE session_voice_turn_fragments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  user_id text NOT NULL,
  speaker_name text NOT NULL,
  character_id text,
  player_message text NOT NULL,
  player_message_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  anchor_ms bigint NOT NULL,
  pending_rolls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turn_id, user_id)
);

CREATE INDEX idx_session_voice_turn_fragments_turn ON session_voice_turn_fragments(turn_id);

CREATE TABLE session_voice_turns (
  turn_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  merged_at timestamptz NOT NULL DEFAULT now(),
  chat_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL
);

CREATE INDEX idx_session_voice_turns_session ON session_voice_turns(session_id);
