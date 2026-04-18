-- Shared session room soundtrack (Storage paths + transport), synced via Realtime.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS soundtrack_state JSONB DEFAULT NULL;

COMMENT ON COLUMN sessions.soundtrack_state IS
  'Room music: { ambientPath, combatPath, isPlaying, revision } — volume and playback time are local only';
