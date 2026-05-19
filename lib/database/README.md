# Database Setup Guide

## Fresh Database

For a new Supabase project, run `schema.sql` in the SQL Editor. It is the squashed current schema and includes:

- Core tables, reference data tables, indexes, triggers, and comments
- Current session columns: combat state, map state, soundtrack state, and scene images
- Map presets
- Row-Level Security helpers and policies
- Supabase Realtime publication setup for sessions, characters, tokens, and chat
- Avatars and soundtrack storage buckets/policies

Do not run the historical migrations after `schema.sql` on a fresh database.

## Existing Database

The `migrations/` folder is only for older databases that were created before the squashed schema. Apply only the migrations your database has not already received.

`022_remove_ai_voice_tts.sql` removes the old AI/STT/TTS database artifacts from existing databases.

## Environment

Set these in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never expose the service role key to the browser.
