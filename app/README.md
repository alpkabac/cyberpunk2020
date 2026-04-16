# AI-GM Multiplayer Cyberpunk 2020 App

A real-time multiplayer web application for playing Cyberpunk 2020 TTRPG with an AI Game Master.

## Features

- **AI Game Master**: Powered by OpenRouter (GLM 4.7) with tool calling for game state management
- **Voice Input**: Speech-to-text with speaker diarization
- **Real-time Multiplayer**: WebSocket-based synchronization
- **Character Management**: Full character sheets with automatic stat calculation
- **Combat Automation**: Damage pipeline, armor ablation, wound tracking
- **Shopping System**: AI-driven item purchasing
- **Map & Tokens**: Visual representation with drag-and-drop
- **TTS Narration**: Immersive audio narration

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React 18+, Tailwind CSS
- **State Management**: Zustand
- **Database & Auth**: Supabase (PostgreSQL + Realtime + Auth)
- **AI**: OpenRouter API (GLM 4.7)
- **Voice**: Deepgram/Azure (STT), OpenAI/ElevenLabs (TTS)
- **Testing**: fast-check (property-based testing)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenRouter API key
- STT/TTS API keys (Deepgram, OpenAI, or alternatives)

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

Copy `.env.local.example` to `.env.local` and fill in your API keys:

```bash
cp .env.local.example .env.local
```

Required environment variables:
- `CP2020_OPENROUTER_API_KEY`: OpenRouter API key (avoids Windows `OPENROUTER_API_KEY` shadowing `.env.local`; legacy names still supported)
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `STT_API_KEY`: Speech-to-text API key
- `TTS_API_KEY`: Text-to-speech API key

3. Set up Supabase database:

Run the database schema setup (instructions in `/lib/data/schema.sql` once created)

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Project Structure

```
app/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── character/         # Character sheet components
│   ├── chat/              # Chat interface components
│   ├── dice/              # Dice roller components
│   └── map/               # Map and token components
├── lib/                   # Core libraries
│   ├── ai/                # AI-GM orchestrator, lorebook, tools
│   ├── data/              # Game data and database access
│   ├── game-logic/        # Core game formulas and rules
│   └── voice/             # STT/TTS processing
└── public/                # Static assets
```

## Development

### Running Tests

```bash
npm test
```

### Property-Based Tests

This project uses fast-check for property-based testing to ensure correctness of game logic:

```bash
npm test -- --grep "Property"
```

## Deployment

Deploy to Vercel:

```bash
vercel deploy
```

Make sure to set all environment variables in your Vercel project settings.

## Documentation

- [Requirements Document](.kiro/specs/ai-gm-multiplayer-app/requirements.md)
- [Design Document](.kiro/specs/ai-gm-multiplayer-app/design.md)
- [Implementation Tasks](.kiro/specs/ai-gm-multiplayer-app/tasks.md)

## License

This project is built on top of the Cyberpunk 2020 Foundry VTT system.
