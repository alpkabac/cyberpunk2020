-- Allow any authenticated session participant to UPDATE NPC rows (damage, stun, etc. during play).
-- Previously only the session creator could UPDATE NPCs, while DELETE already allowed participants (008).
-- Without this, non-host clients could not persist applyDamage to NPCs; host could miss persistence when
-- the open sheet was a PC but Combat targeted an NPC.

DROP POLICY IF EXISTS "Users can update their own characters" ON characters;
CREATE POLICY "Users can update their own characters"
  ON characters FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (type = 'npc' AND is_user_in_session(session_id))
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (type = 'npc' AND is_user_in_session(session_id))
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  );
