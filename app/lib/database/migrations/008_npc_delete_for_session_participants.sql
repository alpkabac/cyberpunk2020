-- Allow any authenticated session participant to delete NPC rows (not only the GM).
-- Safe to run if 006 already applied the older GM-only NPC delete rule.
DROP POLICY IF EXISTS "Users can delete their own characters" ON characters;
CREATE POLICY "Users can delete their own characters"
  ON characters FOR DELETE
  USING (
    user_id = auth.uid()
    OR (type = 'npc' AND is_user_in_session(session_id))
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  );
