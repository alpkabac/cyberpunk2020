-- Unclaimed player characters (user_id NULL): GM may create, edit, delete; players claim via RPC.
-- Replaces characters INSERT/UPDATE/DELETE policies from rls-policies.sql.

-- ---------------------------------------------------------------------------
-- Claim a player character slot (sets user_id = auth.uid() when still NULL).
-- SECURITY DEFINER bypasses RLS; still enforces business rules in SQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_session_character(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid;
  ctype text;
  cuid uuid;
BEGIN
  SELECT session_id, type, user_id INTO sid, ctype, cuid
  FROM characters
  WHERE id = p_character_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'character not found';
  END IF;

  IF ctype IS DISTINCT FROM 'character' THEN
    RAISE EXCEPTION 'not a player character';
  END IF;

  IF cuid IS NOT NULL THEN
    RAISE EXCEPTION 'already claimed';
  END IF;

  IF NOT is_user_in_session(sid) THEN
    RAISE EXCEPTION 'not in session';
  END IF;

  IF EXISTS (
    SELECT 1 FROM characters
    WHERE session_id = sid
      AND user_id = auth.uid()
      AND type = 'character'
      AND id <> p_character_id
  ) THEN
    RAISE EXCEPTION 'already has a character in this session';
  END IF;

  UPDATE characters
  SET user_id = auth.uid(), updated_at = NOW()
  WHERE id = p_character_id;
END;
$$;

REVOKE ALL ON FUNCTION claim_session_character(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_session_character(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create characters in their sessions" ON characters;
CREATE POLICY "Users can create characters in their sessions"
  ON characters FOR INSERT
  WITH CHECK (
    is_user_in_session(session_id)
    AND (
      (type = 'character' AND user_id = auth.uid())
      OR (type = 'npc' AND (user_id IS NULL OR user_id = auth.uid()))
      OR (
        type = 'character'
        AND user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their own characters" ON characters;
CREATE POLICY "Users can update their own characters"
  ON characters FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (
      type = 'npc'
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      type = 'npc'
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  );

COMMENT ON FUNCTION claim_session_character(uuid) IS
  'Assigns an unclaimed player character (user_id NULL) to the caller if they are in the session and do not already own another PC there.';

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
