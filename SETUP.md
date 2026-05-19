# Project Setup

## Environment

Create `.env.local` from `.env.local.example` and provide the Supabase values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

## Supabase

For a fresh Supabase project, run `lib/database/schema.sql` only. It already includes the current table shape, RLS policies, realtime setup, and storage buckets.

Use `lib/database/migrations` only for existing databases that predate the squashed schema.

## Run

```bash
npm install
npm run dev
```

## Verify

```bash
npm test -- --run
npm run build
```
