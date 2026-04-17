-- ============================================================================
-- Storage: character avatars bucket (`avatars`)
-- ============================================================================
-- Run in Supabase SQL after creating the "avatars" bucket in the dashboard.
-- Path layout (must match app upload): {session_id}/{character_id}/{uuid}.{ext}
--
-- Dashboard checklist:
-- - Create bucket named `avatars`
-- - Enable "Public bucket" if you use getPublicUrl() for portraits (recommended)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Anyone can fetch avatar images (portraits load in <img> for all session viewers).
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users may upload only under session/character folders they may edit
-- (PC owner or session host — same rules as character sheet updates).
DROP POLICY IF EXISTS "Avatar upload for character editors" ON storage.objects;
CREATE POLICY "Avatar upload for character editors"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.session_id::text = (storage.foldername(name))[1]
        AND c.id::text = (storage.foldername(name))[2]
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.id = c.session_id AND s.created_by = auth.uid()
          )
        )
    )
  );

-- Allow replacing/removing objects on paths the user could upload to (optional cleanup).
DROP POLICY IF EXISTS "Avatar update for character editors" ON storage.objects;
CREATE POLICY "Avatar update for character editors"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.session_id::text = (storage.foldername(name))[1]
        AND c.id::text = (storage.foldername(name))[2]
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.id = c.session_id AND s.created_by = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.session_id::text = (storage.foldername(name))[1]
        AND c.id::text = (storage.foldername(name))[2]
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.id = c.session_id AND s.created_by = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Avatar delete for character editors" ON storage.objects;
CREATE POLICY "Avatar delete for character editors"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.session_id::text = (storage.foldername(name))[1]
        AND c.id::text = (storage.foldername(name))[2]
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.id = c.session_id AND s.created_by = auth.uid()
          )
        )
    )
  );
