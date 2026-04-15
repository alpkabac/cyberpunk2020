-- Enable Supabase Realtime (postgres_changes) for session sync tables.
-- Run in the Supabase SQL editor after schema + RLS.
-- Idempotent: ignores errors if already added (run each ALTER separately if needed).

ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
