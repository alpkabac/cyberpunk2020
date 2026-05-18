# Project Setup

## Environment

Create `.env.local` from `.env.local.example` and provide the Supabase values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

## Supabase

Create a Supabase project, run `lib/database/schema.sql`, then apply migrations in order from `lib/database/migrations`.

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
