-- Include full row in Postgres UPDATE WAL entries so Supabase Realtime payloads
-- are not column-subsets that would wipe JSON arrays (items, skills) on the client.
ALTER TABLE public.characters REPLICA IDENTITY FULL;
