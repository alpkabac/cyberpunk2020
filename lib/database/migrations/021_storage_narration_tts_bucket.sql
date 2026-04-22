-- ============================================================================
-- Storage: narration TTS audio (private bucket; clients use signed URLs only)
-- ============================================================================
-- Dashboard: create bucket `narration-tts`, leave **public** OFF.
-- Uploads use the service role from API routes; reads use createSignedUrl().
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('narration-tts', 'narration-tts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- No SELECT for anon/authenticated: only signed URLs (issued server-side) work.
