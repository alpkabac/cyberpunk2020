-- Backfill voice fields inside sessions.settings JSONB for existing rows.
-- New keys match schema.sql defaults and lib/realtime/db-mapper.ts DEFAULT_SETTINGS.

UPDATE sessions
SET settings =
  COALESCE(settings, '{}'::jsonb)
  || jsonb_build_object(
    'voiceInputMode',
    COALESCE(settings->'voiceInputMode', '"pushToTalk"'::jsonb),
    'sessionRecordingStartedBy',
    COALESCE(settings->'sessionRecordingStartedBy', 'null'::jsonb)
  );
