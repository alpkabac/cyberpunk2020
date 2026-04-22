-- ============================================================================
-- Storage: `soundtrack` — authenticated client uploads to ambient/ and combat/
-- ============================================================================
-- Apply when your role can create policies on storage.objects (see 016 for
-- dashboard vs SQL tradeoffs). Clients upload via `uploadSoundtrackFile` to
-- paths `ambient/<file>` and `combat/<file>` (single path segment, no subdirs).
-- Requires bucket `soundtrack` (public read for object URLs, per 016).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('soundtrack', 'soundtrack', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Upsert of an existing key uses UPDATE; both INSERT and UPDATE must pass RLS.
DROP POLICY IF EXISTS "Soundtrack insert for authenticated" ON storage.objects;
CREATE POLICY "Soundtrack insert for authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'soundtrack'
    AND (name ~ '^ambient/[^/]+$' OR name ~ '^combat/[^/]+$')
  );

DROP POLICY IF EXISTS "Soundtrack update for authenticated" ON storage.objects;
CREATE POLICY "Soundtrack update for authenticated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'soundtrack' AND (name ~ '^ambient/[^/]+$' OR name ~ '^combat/[^/]+$'))
  WITH CHECK (bucket_id = 'soundtrack' AND (name ~ '^ambient/[^/]+$' OR name ~ '^combat/[^/]+$'));
