-- Initiative / turn tracker (Task 20): JSON on sessions, synced via Realtime.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS combat_state JSONB DEFAULT NULL;

COMMENT ON COLUMN sessions.combat_state IS 'FNFF combat: { version, round, activeTurnIndex, entries[] } or null';
