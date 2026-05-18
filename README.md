# Cyberpunk 2020 Multiplayer Table App

A real-time multiplayer web application for running Cyberpunk 2020 sessions with a human GM.

## Features

- Real-time multiplayer sessions with Supabase auth and sync
- Character sheets, lifepath, starting gear, and shared session ownership
- FNFF dice, damage, armor ablation, wound, stun/death save, initiative, and combat controls
- Tactical map, tokens, cover, suppressive fire helpers, scene images, and soundtrack playback
- Manual table chat with player messages, GM narration, and roll log entries

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

3. Run the database schema and migrations from `lib/database`.

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Development

```bash
npm test
npm run build
```
