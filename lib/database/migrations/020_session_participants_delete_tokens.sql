-- Any session participant may delete map tokens (player- or GM-controlled, with or without character_id).
-- Previously only the token "controller" could delete: players their linked PC token, host all GM tokens.
-- That left stray GM/NPC tokens undeletable by other players when the AI or host placed them.

DROP POLICY IF EXISTS "Users can delete tokens they control" ON tokens;
CREATE POLICY "Session participants can delete tokens"
  ON tokens FOR DELETE
  USING (is_user_in_session(session_id));
