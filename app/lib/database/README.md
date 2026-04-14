# Database Setup Guide

This directory contains SQL scripts for setting up the Supabase database for the AI-GM Cyberpunk 2020 application.

## Prerequisites

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and keys to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Setup Instructions

### 1. Run Schema Creation

Open the Supabase SQL Editor and run the contents of `schema.sql`. This will:
- Create all necessary tables (sessions, characters, tokens, chat_messages, etc.)
- Set up indexes for optimal query performance
- Create triggers for automatic timestamp updates
- Add game data tables (weapons, armor, cyberware, gear, vehicles, skills, programs)

### 2. Run RLS Policies

After the schema is created, run the contents of `rls-policies.sql`. This will:
- Enable Row-Level Security on all tables
- Create policies to ensure users can only access their own data
- Allow users to view data from sessions they're part of
- Restrict session deletion to session creators only
- Make game data tables read-only for all authenticated users

## Database Structure

### Core Tables

- **sessions**: Game sessions with map state, active scene, and settings
- **characters**: Player characters and NPCs with full stats, skills, and inventory
- **tokens**: Visual representations of characters on the map
- **chat_messages**: Chat history including narration, player messages, and rolls

### Game Data Tables (Reference Data)

- **weapons**: All weapons with stats, damage, range, etc.
- **armor**: All armor with coverage and SP values
- **cyberware**: All cyberware with humanity costs
- **gear**: Miscellaneous items
- **vehicles**: All vehicles with stats
- **skills_reference**: Reference data for all skills
- **programs**: Netrunning programs

## Security Model

### Row-Level Security (RLS)

The database uses RLS to enforce access control:

1. **Session Access**: Users can only access sessions they created or have characters in
2. **Character Ownership**: Users can only modify their own characters
3. **NPC Management**: Only session creators (GMs) can modify NPCs
4. **Token Control**: Players can move their own tokens, GMs can move all tokens
5. **Session Deletion**: Only session creators can delete sessions
6. **Game Data**: All authenticated users can read game data tables

### Service Role

The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and should only be used for:
- Server-side operations (API routes)
- Administrative tasks
- AI-GM tool execution

Never expose the service role key to the client!

## Data Models

All TypeScript interfaces are defined in `app/lib/types.ts` and match the database schema.

## Maintenance

### Adding New Tables

1. Add the table definition to `schema.sql`
2. Add appropriate RLS policies to `rls-policies.sql`
3. Update TypeScript interfaces in `app/lib/types.ts`

### Modifying Existing Tables

Use Supabase migrations for schema changes in production:

```sql
-- Example migration
ALTER TABLE characters ADD COLUMN new_field TEXT;
```

## Testing

The database schema supports the following property-based tests:
- Property 1: Session Persistence Round-Trip
- Property 2: Session Isolation
- Property 28: Authentication Enforcement
- Property 29: Character Ownership
- Property 30: Session Creator Permissions

See the design document for full property definitions.
