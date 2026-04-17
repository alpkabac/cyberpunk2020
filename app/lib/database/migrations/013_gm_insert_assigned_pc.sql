-- Allow session GM to create player characters already assigned to a player (multi-PC slots).
DROP POLICY IF EXISTS "Users can create characters in their sessions" ON public.characters;

CREATE POLICY "Users can create characters in their sessions"
  ON public.characters FOR INSERT
  WITH CHECK (
    is_user_in_session(session_id) AND
    (
      (type = 'character' AND user_id = auth.uid()) OR
      (type = 'npc' AND (user_id IS NULL OR user_id = auth.uid())) OR
      (
        type = 'character' AND user_id IS NULL AND
        EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND created_by = auth.uid())
      ) OR
      (
        type = 'character' AND user_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND created_by = auth.uid())
      )
    )
  );
