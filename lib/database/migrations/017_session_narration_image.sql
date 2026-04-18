-- GM / AI tool: shared scene image for all players (Realtime via `sessions`).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS narration_image JSONB DEFAULT NULL;

COMMENT ON COLUMN sessions.narration_image IS
  'Optional { url, caption?, revision } shown in session room; null = hidden.';
