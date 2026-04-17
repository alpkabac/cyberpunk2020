-- ============================================================================
-- Storage: character avatars bucket (`avatars`)
-- ============================================================================
-- Run in Supabase SQL after creating the "avatars" bucket in the dashboard.
-- Path layout (must match app upload): {session_id}/{character_id}/{filename}
--
-- Uses SECURITY DEFINER so permission checks are not blocked by RLS on
-- `characters` inside storage policy subqueries (a common cause of
-- "new row violates row-level security policy" on upload).
--
-- Dashboard checklist:
-- - Create bucket named `avatars`
-- - Enable "Public bucket" if you use getPublicUrl() for portraits (recommended)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ---------------------------------------------------------------------------
-- Permission helper: path must be session_id/character_id/<file>
-- Allowed if the user owns the character OR created the session (GM).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_character_avatar_object(p_name text, p_bucket_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  sid uuid;
  cid uuid;
  seg1 text;
  seg2 text;
  seg3 text;
BEGIN
  IF p_bucket_id IS DISTINCT FROM 'avatars' THEN
    RETURN false;
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN false;
  END IF;

  seg1 := split_part(p_name, '/', 1);
  seg2 := split_part(p_name, '/', 2);
  seg3 := split_part(p_name, '/', 3);
  IF seg1 = '' OR seg2 = '' OR seg3 = '' THEN
    RETURN false;
  END IF;

  BEGIN
    sid := seg1::uuid;
    cid := seg2::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM characters c
    WHERE c.session_id = sid
      AND c.id = cid
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = c.session_id AND s.created_by = auth.uid()
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_character_avatar_object(text, text) FROM PUBLIC;

-- Anyone can fetch avatar images (portraits load in <img> for all session viewers).
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Avatar upload for character editors" ON storage.objects;
CREATE POLICY "Avatar upload for character editors"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_character_avatar_object(name, bucket_id));

DROP POLICY IF EXISTS "Avatar update for character editors" ON storage.objects;
CREATE POLICY "Avatar update for character editors"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (public.can_manage_character_avatar_object(name, bucket_id))
  WITH CHECK (public.can_manage_character_avatar_object(name, bucket_id));

DROP POLICY IF EXISTS "Avatar delete for character editors" ON storage.objects;
CREATE POLICY "Avatar delete for character editors"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (public.can_manage_character_avatar_object(name, bucket_id));
