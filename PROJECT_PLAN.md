# Cyberpunk 2020: AI Game Master Web App

## What We're Building

A standalone web app for playing Cyberpunk 2020 tabletop RPG **without a human GM**.
An AI runs the game — narrating, adjudicating rules, controlling NPCs, and managing the world.
Players get character sheets, a simple map with draggable tokens, AI-generated scenery, and TTS narration.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (Next.js)                   │
│                                                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │  Character  │  │    Map     │  │   AI Chat /    │ │
│  │   Sheets    │  │  + Tokens  │  │  GM Console    │ │
│  └────────────┘  └────────────┘  └────────────────┘ │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │    Dice     │  │  Scenery   │  │   Inventory    │ │
│  │   Roller    │  │  Display   │  │    / Shop      │ │
│  └────────────┘  └────────────┘  └────────────────┘ │
└────────────────────────┬────────────────────────────┘
                         │
             ┌───────────┴───────────┐
             │    Backend / API      │
             │                       │
             │  • AI GM (LLM API)    │
             │  • TTS generation     │
             │  • Image generation   │
             │  • Game state sync    │
             └───────────┬───────────┘
                         │
             ┌───────────┴───────────┐
             │     Data Layer        │
             │                       │
             │  • Character data     │
             │  • CP2020 rules DB    │
             │  • Session history    │
             │  • Generated assets   │
             └───────────────────────┘
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (React) | API routes + frontend in one project, fast to scaffold |
| State | Zustand | Minimal boilerplate, simple |
| Persistence | Supabase or Firebase | Realtime sync for multiplayer, auth, storage for free |
| Styling | Tailwind + cyberpunk theme | Fast to vibecode, pull colors from existing SCSS |
| Dice | Custom (~50 lines) | Just need `XdY` + exploding d10 |
| AI GM | OpenAI / Claude API with tool calling | The AI doesn't just chat — it mutates game state via tools |
| TTS | OpenAI TTS API or ElevenLabs | GM narration read aloud |
| Image Gen | DALL-E / Flux | Scene illustrations on demand |
| Multiplayer | Supabase Realtime or Firebase Realtime DB | Free tier covers small groups |

---

## Key Design Principle

**The app owns the data. The AI owns the narrative.**

- Character sheets do their own math (stat totals, armor SP, wound state, BTM). These numbers are always correct.
- The AI-GM reads that data, makes rulings, narrates outcomes, and calls tools to update state.
- Players never argue with a calculator. The AI never silently gets a number wrong.

---

## The AI-GM: How It Works

The AI-GM has **tool/function calls** that directly change game state. When the AI says
*"the bullet rips through your left arm for 8 damage after armor"*, it simultaneously calls
`apply_damage("player1", 8, "lArm")` and the character sheet updates live.

### AI Tools

| Tool | What It Does |
|---|---|
| `apply_damage(character, amount, location)` | Deduct HP, update wound track |
| `deduct_money(character, amount)` | Subtract eurobucks |
| `add_item(character, item)` | Add weapon/gear/cyberware to inventory |
| `remove_item(character, item_id)` | Remove from inventory |
| `request_roll(character, skill, modifiers)` | Ask a player to roll dice |
| `move_token(token_id, x, y)` | Reposition NPC token on map |
| `generate_scenery(description)` | Trigger image generation for a scene |
| `play_narration(text)` | Send text to TTS |
| `lookup_rules(topic)` | Fetch a rules reference file for deeper knowledge |

### Three-Layer Knowledge System

**Layer 1 — System Prompt (~1,500 tokens, always present):**
Core rules the AI needs every turn — combat flow, damage pipeline, wound thresholds, BTM table, range DCs, SP layering, armor ablation, head hit multiplier.

**Layer 2 — Session Context (injected per-turn):**
All PC sheets as compact JSON (stats, skills, weapons, armor, HP, money), active NPCs, current scene description, rolling session summary.

**Layer 3 — Retrievable Reference (on demand):**
Topic-specific rules files loaded via keyword triggers or AI tool calls:

```
/rules
  /core         → combat-basics.md, damage-pipeline.md, skill-checks.md
  /topics       → ranged-combat.md, melee-combat.md, autofire.md, netrunning.md,
                  cyberware-rules.md, vehicle-combat.md, shopping.md
  /catalogs     → weapons.json, armor.json, cyberware.json, skills.json, gear.json
```

Each topic file has keyword triggers (SillyTavern Lorebook style):
- Player says "I fire my gun" → injects `ranged-combat.md`
- Player says "I jack into the NET" → injects `netrunning.md`
- AI calls `lookup_rules("martial_arts")` when it needs detail

---

## What We Take From the Foundry System

This repo (`cyberpunk2020/`) is a Foundry VTT system with all the game data and rules logic already implemented. We extract:

| Source | What We Get | Used For |
|---|---|---|
| `template.json` | Character & item data schemas | Data models for the app |
| `lookups.js` | Weapon types, ranges, DCs, fire modes, martial art bonuses, BTM table | App sheet logic + Layer 1/3 rules docs |
| `lang/en.json` | All UI labels, stat names, skill names | Frontend labels + AI vocabulary |
| `packs/*.db` | Weapons, armor, cyberware, skills, vehicles, gear with full stats & costs | Export to JSON → game database + Layer 3 catalogs |
| `actor.js` | SP layering formula, wound state calc, BTM, humanity, stat derivations | Reimplement key formulas in the app's sheet component |
| `scss/` | Cyberpunk visual theme, colors, fonts | Adapt into Tailwind theme |

We do **NOT** port: Foundry's document system, sheet classes, dialog system, chat message system, migration code, or Handlebars templates. Those are all Foundry-specific plumbing we replace with React + Zustand.

---

## The Four Originally Planned Features

These all become simpler with an AI-GM:

| Feature | Old Approach (Foundry) | New Approach (AI-GM) |
|---|---|---|
| Target selection + auto damage | Complex SP/BTM/ablation pipeline + chat buttons | AI calculates, calls `apply_damage()` tool |
| Shopping + money deduction | Shop UI, price dialogs | Player asks AI-GM to buy. AI calls `deduct_money()` + `add_item()` |
| Cinematic finishing moves | Roll tables + trigger detection | AI narrates naturally — LLMs are great at this |
| Mech sheet | New actor type + full sheet + combat integration | Simpler vehicle data card. AI handles mech combat rules conversationally |

---

## Build Order

| Day | What to Build |
|---|---|
| **1-2** | Scaffold Next.js app. Character sheet component with CP2020 math (stats, skills, wound track, inventory). Export compendium data to JSON. |
| **3** | Dice roller + AI-GM integration with tool calling. Core loop: player describes action → AI responds → rolls happen → state updates. |
| **4** | Map component (background image + draggable token divs). Scenery image display panel. |
| **5** | TTS integration. Shopping flow via AI tools. Polish the chat/GM console UI. |
| **6-7** | Multiplayer sync (if needed). System prompt refinement. Playtesting and iteration. |

---

## Important Warnings

1. **Don't trust the AI's training data for CP2020 specifics.** It knows the game broadly but gets weapon stats, SP rules, and skill details wrong. The curated rules files are the source of truth.

2. **Don't dump the whole rulebook PDF into context.** A focused 3,000-word rules reference outperforms an 80,000-word PDF dump every time. Less noise, fewer contradictions, cheaper, faster.

3. **Don't paste raw JavaScript into AI prompts.** Translate code into natural-language rules. The AI needs *"full auto: each point above DC = one hit"*, not `if(attackMods.fireMode === fireModes.fullAuto)`.

4. **Test the system prompt first.** Before writing any app code, paste the Layer 1 rules + a character sheet JSON into ChatGPT/Claude and run a few combat rounds. If the AI adjudicates correctly, the foundation is solid.

---

## Backlog & follow-ups

See **[BACKLOG.md](./BACKLOG.md)** for the living list (ranged mods, point-blank damage, exploding-10 reminders, reliability, stabilization, chargen, gear-driven combat modifiers, netrunning *deferred*, etc.).
