-- Map presets: RLS was missing after table creation; inserts failed with
-- "new row violates row-level security policy for table map_presets".

ALTER TABLE map_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Session participants can view map presets" ON map_presets;
CREATE POLICY "Session participants can view map presets"
  ON map_presets FOR SELECT
  USING (is_user_in_session(session_id));

DROP POLICY IF EXISTS "GMs can create map presets" ON map_presets;
CREATE POLICY "GMs can create map presets"
  ON map_presets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_id
        AND sessions.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "GMs can update map presets" ON map_presets;
CREATE POLICY "GMs can update map presets"
  ON map_presets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = map_presets.session_id
        AND sessions.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = map_presets.session_id
        AND sessions.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "GMs can delete map presets" ON map_presets;
CREATE POLICY "GMs can delete map presets"
  ON map_presets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = map_presets.session_id
        AND sessions.created_by = auth.uid()
    )
  );
