# Implementation Plan: AI-GM Multiplayer Cyberpunk 2020 App

## Overview

This implementation plan breaks down the design into discrete coding tasks. The approach is incremental: start with core game logic (pure functions), build up the data layer and state management, then add the UI components, AI integration, and finally real-time multiplayer features. Each task builds on previous work, with checkpoints to validate progress.

### Architecture decisions (current)

- **Real-time sync:** **Supabase Realtime** (not a custom WebSocket server in Next.js). Authoritative state lives in **PostgreSQL**; clients subscribe via **`postgres_changes`**. Ephemeral events (typing hints, optional live drag previews, roll prompts) use **Realtime `broadcast`** on a per-session channel when not worth persisting as rows.
- **AI and voice:** **Next.js Route Handlers** (`app/api/.../route.ts`) call **OpenRouter**, STT, and TTS with secrets in server-side env vars. The browser never holds API keys for those services.
- **Tabletop trust:** Dice use the **client** dice roller; the AI **`request_roll`** tool is for **guidance** (open roller, suggest formula), not cryptographic enforcement. Players may apply damage, initiative order, and sheet edits themselves—consistent with a trusted group.
- **Deployment:** Prefer **self-hosted Next.js on a VPS** (or similar long-running host) as the primary target; cloud platforms (e.g. Vercel) remain valid if Realtime + API routes fit the hosting model.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Initialize Next.js 14+ project with TypeScript and App Router
  - Install dependencies: Zustand, Tailwind CSS, Supabase client, fast-check
  - Configure Tailwind with cyberpunk color theme from Foundry SCSS
  - Set up environment variables for API keys (OpenRouter, Supabase, STT, TTS)
  - _Requirements: 18.1, 18.2, 18.3, 14.1_

- [x] 2. Implement core game logic module
  - [x] 2.1 Create formulas.ts with Cyberpunk 2020 calculations
    - Implement btmFromBT(bt): BTM lookup table
    - Implement strengthDamageBonus(bt): Strength damage bonus
    - Implement calculateDerivedStats(character): run, leap, carry, lift, humanity, currentEmp
    - Implement calculateWoundState(damage): wound state and penalties
    - Implement combineSP(a, b): armor layering formula
    - Implement maxLayeredSP(spValues): optimal SP layering for 3+ pieces
    - _Requirements: 5.1, 5.4_

  - [x] 2.2 Write property test for BTM calculation
    - **Property 12: Derived Stats Calculation**
    - **Validates: Requirements 5.1**

  - [x] 2.3 Write property test for wound state calculation
    - **Property 14: Damage Application and Wound State**
    - **Validates: Requirements 5.2, 5.5, 6.3, 6.4**

  - [x] 2.4 Write property test for SP layering
    - **Property 13: Armor SP Layering**
    - **Validates: Requirements 5.4**

  - [x] 2.5 Create dice.ts with dice rolling logic
    - Implement rollExplodingD10(): exploding d10 logic
    - Implement parseDiceFormula(formula): parse XdY, XdY+Z, 1d10x10
    - Implement rollDice(formula): execute dice roll and return results
    - _Requirements: 12.2, 12.3_

  - [x] 2.6 Write property test for exploding d10
    - **Property 25: Exploding D10**
    - **Validates: Requirements 12.2**

  - [x] 2.7 Write property test for dice formula parsing
    - **Property 26: Dice Formula Parsing**
    - **Validates: Requirements 12.3**

  - [x] 2.8 Create lookups.ts with game constants
    - Export weapon types, attack skills, fire modes, martial actions
    - Export range DCs, hit location table, martial action bonuses
    - Export concealability, availability, reliability enums
    - _Requirements: 6.5_

  - [x] 2.9 Write property test for hit location mapping
    - **Property 17: Hit Location Mapping**
    - **Validates: Requirements 6.5**

- [ ] 3. Checkpoint - Validate game logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Set up Supabase database and data models
  - [x] 4.1 Create Supabase project and configure connection
    - Set up Supabase project in cloud
    - Add connection string to environment variables
    - Initialize Supabase client in lib/supabase.ts
    - _Requirements: 18.5_

  - [x] 4.2 Create database schema
    - Create sessions table with map, scene, settings
    - Create characters table with stats, skills, items, wound tracking
    - Create tokens table with position and ownership
    - Create chat_messages table with speaker and type
    - Create game data tables: weapons, armor, cyberware, gear, vehicles, skills
    - Add indexes on session_id, user_id, created_at
    - _Requirements: 1.4, 11.1, 11.2_

  - [x] 4.3 Set up Row-Level Security policies
    - Users can only read/write their own characters
    - Users can read all data in sessions they're part of
    - Only session creators can delete sessions
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ]* 4.4 Write property test for session isolation
    - **Property 2: Session Isolation**
    - **Validates: Requirements 1.5, 11.4**

  - [x] 4.5 Create TypeScript interfaces for data models
    - Define Character, StatBlock, HitLocation, Item, Weapon, Armor, Cyberware
    - Define Session, MapState, Token, ChatMessage, Scene
    - Define DerivedStats, WoundState, WoundPenalties
    - _Requirements: 5.1_

- [x] 5. Extract and import game data from Foundry
  - [x] 5.1 Export Foundry compendium data to JSON
    - Extract weapons, armor, cyberware, skills, gear, vehicles from packs/*.db
    - Save to lib/data/ as JSON files
    - _Requirements: 13.1, 13.2_

  - [x] 5.2 Create data import scripts
    - Write script to import JSON data into Supabase tables
    - Validate data integrity during import
    - _Requirements: 13.3, 13.5_

  - [ ]* 5.3 Write property test for data schema conversion
    - **Property 27: Data Schema Conversion**
    - **Validates: Requirements 13.3**

  - [x] 5.4 Create data access layer
    - Implement functions to query weapons, armor, cyberware, etc.
    - Add caching for static game data
    - _Requirements: 7.1, 7.4, 17.5_

  - [ ]* 5.5 Write property test for item catalog lookup
    - **Property 18: Item Catalog Lookup**
    - **Validates: Requirements 7.1**

- [x] 6. Implement Zustand store for client state
  - [x] 6.1 Create game-store.ts with state structure
    - Define store slices: characters, session, map, chat, ui
    - Implement selectors for derived data
    - _Requirements: 5.1_

  - [x] 6.2 Implement state mutation actions
    - applyDamage(characterId, amount, location): update damage and wound state
    - deductMoney(characterId, amount): subtract eurobucks
    - addItem(characterId, item): add to inventory
    - removeItem(characterId, itemId): remove from inventory
    - updateCharacterField(characterId, path, value): generic field update
    - moveToken(tokenId, x, y): update token position
    - addChatMessage(message): append to chat history
    - _Requirements: 3.1, 3.4, 6.1, 6.2, 6.3_

  - [ ]* 6.3 Write property test for damage pipeline
    - **Property 15: Damage Pipeline**
    - **Validates: Requirements 6.1**

  - [ ]* 6.4 Write property test for armor ablation
    - **Property 16: Armor Ablation**
    - **Validates: Requirements 6.2**

  - [ ]* 6.5 Write property test for purchase validation
    - **Property 19: Purchase Validation**
    - **Validates: Requirements 7.3**

- [x] 7. Build Character Sheet component (✅ COMPLETE!)
  
  **COMPLETION STATUS:**
  - ✅ Core character sheet (7.1-7.5): COMPLETE
  - ✅ ItemBrowser (7.7): COMPLETE
  - ✅ Shopping (7.8): COMPLETE with purchase transactions
  - ✅ Cyberware (7.10): COMPLETE (basic version, chipware optional)
  - ✅ Armor (7.11): COMPLETE with layering, encumbrance, unequip
  - ✅ Program manager (7.12): COMPLETE
  - ✅ Combat (7.13): COMPLETE with initiative mods, cyberweapons, SDP
  - ✅ Skills (7.14): COMPLETE (basic version, chip toggles optional)
  - ❌ Drag-drop (7.9): SKIPPED - not needed
  
  **ALL CRITICAL FEATURES IMPLEMENTED!**
  
  ---

  - [x] 7.1 Create CharacterSheet.tsx with stat display
    - Display all 9 stats with base, tempMod, and computed total
    - Display derived stats: BTM, run, leap, carry, lift, humanity, currentEmp
    - Display wound state and current damage
    - _Requirements: 5.1, 5.3_

  - [x] 7.2 Add skills list with roll buttons
    - Display all skills with values and linked stats
    - Add roll button for each skill
    - _Requirements: 5.3_

  - [x] 7.3 Add wound tracker and hit locations
    - Display wound state with color coding
    - Show hit locations with current SP and ablation
    - _Requirements: 5.3, 6.2_

  - [x] 7.4 Add inventory and equipment management
    - Display weapons, armor, cyberware, gear
    - Add equip/unequip functionality
    - Show eurobucks
    - _Requirements: 5.3_

  - [x] 7.5 Add stat editing for base values
    - Allow manual editing of base stats
    - Trigger recalculation on change
    - _Requirements: 5.6_

  - [ ]* 7.6 Write unit tests for character sheet rendering
    - Test stat display with various values
    - Test wound state color coding
    - Test inventory display

  - [x] 7.7 Build ItemBrowser component
    - [x] 7.7.1 Create searchable item catalog UI
      - Display all items from database with filtering
      - Support search by name, type, cost range
      - Show item cards with stats and images
      - Add type filter dropdown (weapons, armor, cyberware, gear, vehicles, all)
      - _Requirements: 19.1, 19.2_
      - **COMPLETED:** ItemBrowser.tsx with real-time search and type filtering
    
    - [x] 7.7.2 Add item detail view
      - Display full item stats and description
      - Show purchase price and availability
      - Add "Add to Inventory" button
      - ~~Add "Purchase" button with eurobucks validation~~ (See 7.8 for purchase flow)
      - _Requirements: 19.3, 19.4_
      - **COMPLETED:** Item cards show full details, affordability checking
    
    - [x] 7.7.3 Add item deletion
      - Add delete button to inventory items
      - ~~Show confirmation dialog before deletion~~ (Direct delete for better UX)
      - Remove item from character inventory
      - _Requirements: 19.6_
      - **COMPLETED:** Remove buttons in all tabs (Gear, Cyberware, Netrun)

  - [x] 7.8 Build ShopInterface component (✅ COMPLETE)
    - [x] 7.8.1 Create shopping UI
      - Display item browser with prices
      - Show character's current eurobucks prominently
      - ~~Add purchase confirmation dialog~~ (Direct purchase for better UX)
      - Display item availability and concealability
      - _Requirements: 20.1_
      - **COMPLETED:** ItemBrowser shows prices and affordability
    
    - [x] 7.8.2 Implement purchase transaction
      - Validate sufficient funds before purchase
      - Deduct money and add item to inventory atomically
      - ~~Update database and broadcast changes~~ (Will be added with multiplayer)
      - Handle purchase errors gracefully with clear messages
      - _Requirements: 20.2, 20.3, 20.4_
      - **COMPLETED:** Purchase button deducts money + adds item atomically
      - **COMPLETED:** Free Add button for GM gifts
    
    - [ ] 7.8.3 Support AI-GM purchases **TODO: LATER (Task 8)**
      - Allow AI-GM to trigger purchases via tool calls
      - Bypass UI confirmation for AI-initiated purchases
      - Log purchase in chat history
      - _Requirements: 20.5_
      - **STATUS:** Needs AI-GM integration (Task 8)

  - [ ] 7.9 Implement drag-and-drop inventory management **TODO: OPTIONAL (SKIP)**
    - [ ] 7.9.1 Add drag-and-drop to GearTab
      - Make items draggable with visual feedback
      - Support dropping to equip/unequip
      - Show drop zones with highlighting
      - Handle invalid drops gracefully
      - _Requirements: 19.5_
      - **STATUS:** Not needed - current click-to-add works fine
    
    - [ ] 7.9.2 Add drag-and-drop to CombatTab
      - Drag weapons to equip
      - Drag armor to hit locations
      - Update equipment state on drop
      - Show equipped state visually
      - _Requirements: 19.5_
      - **STATUS:** Not needed - current equip buttons work fine
    
    - [ ] 7.9.3 Implement DragDropInventory component
      - Create reusable drag-and-drop wrapper
      - Support multiple drop target types
      - Handle drag start, drag over, drop events
      - Provide visual feedback during drag
      - _Requirements: 19.5_
      - **STATUS:** Not needed - UX polish, not core functionality

  - [~] 7.10 Build CyberwareInstaller component (PARTIALLY COMPLETE)
    - [ ] 7.10.1 Create body diagram UI **TODO: OPTIONAL (SKIP)**
      - Display body zones: Head, Torso, Arms (L/R), Legs (L/R), Nervous
      - Show installed cyberware per zone with names
      - Display total humanity loss prominently
      - Use anatomy SVG as background
      - _Requirements: 21.1, 21.5_
      - **STATUS:** Current list view works fine, body diagram is visual polish
    
    - [x] 7.10.2 Implement cyberware installation
      - ~~Support dragging cyberware to body zones~~ (Using install buttons instead)
      - ~~Validate zone compatibility~~ (Not needed for basic install)
      - Calculate humanity loss on install
      - Update character state and database
      - ~~Show installation confirmation~~ (Immediate feedback)
      - _Requirements: 21.2, 21.3, 21.4_
      - **COMPLETED:** Install/uninstall buttons in CyberwareTab
    
    - [x] 7.10.3 Add cyberware uninstall
      - Add uninstall button per cyberware piece
      - Move cyberware back to inventory
      - Recalculate humanity loss
      - Update equipped state
      - _Requirements: 21.6_
      - **COMPLETED:** Uninstall button with humanity recalculation
    
    - [ ] 7.10.4 Build ChipwareManager component **TODO: LATER**
      - Display active chip slots with visual icons
      - Support drag-and-drop chip activation
      - Apply/remove skill bonuses on toggle
      - Show chip tooltips with full names on hover
      - Display affected skills per chip
      - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_
      - **STATUS:** Advanced feature, can be added after multiplayer works

  - [x] 7.11 Build ArmorEquipper component (✅ COMPLETE)
    - [x] 7.11.1 Add armor hit location assignment
      - Display hit locations with current SP
      - ~~Support dragging armor to locations~~ (Using equip buttons instead)
      - Show armor coverage per piece
      - Display armor list with coverage summary
      - _Requirements: 23.1, 23.2_
      - **COMPLETED:** Equip buttons per location in CombatTab
    
    - [x] 7.11.2 Implement SP layering calculation
      - Calculate layered SP per location using combineSP
      - Display SP breakdown (base + layered)
      - Update in real-time on equipment changes
      - Show SP for each hit location
      - _Requirements: 23.3_
      - **COMPLETED:** maxLayeredSP function calculates optimal layering
      - **COMPLETED:** Shows layered SP in hit location display
    
    - [x] 7.11.3 Add encumbrance tracking
      - Calculate total armor encumbrance
      - Display REF penalty prominently
      - Update character stats automatically
      - Show encumbrance value in armor section
      - _Requirements: 23.4_
      - **COMPLETED:** Encumbrance calculation with REF penalty display
      - **COMPLETED:** Shows ENC and REF penalty in armor header
    
    - [x] 7.11.4 Add armor unequip
      - Support unequipping armor pieces
      - Recalculate SP and encumbrance
      - Update character state
      - _Requirements: 23.5_
      - **COMPLETED:** Unequip button per hit location

  - [x] 7.12 Build ProgramManager component (COMPLETE - Basic Version)
    - [x] 7.12.1 Create program inventory UI
      - Display all programs with icons
      - Show program stats (MU, type, cost)
      - Add edit/delete buttons per program
      - Display total program cost
      - _Requirements: 24.1_
      - **COMPLETED:** NetrunTab shows all programs with stats
    
    - [x] 7.12.2 Implement program activation
      - ~~Display active program slots with icons~~ (Using list view instead)
      - ~~Support drag-and-drop to activate~~ (Using load buttons instead)
      - ~~Validate RAM availability before activation~~ (Can add later)
      - Track used/max RAM in real-time
      - Show RAM usage prominently
      - _Requirements: 24.2, 24.3, 24.4, 24.5_
      - **COMPLETED:** Load/unload buttons, RAM tracking display
    
    - [x] 7.12.3 Add program deactivation
      - ~~Support right-click to deactivate programs~~ (Using unload button)
      - Recalculate RAM usage
      - Update active programs list
      - ~~Show deactivation confirmation~~ (Immediate feedback)
      - _Requirements: 24.6_
      - **COMPLETED:** Unload button with status indicators

  - [x] 7.13 Enhance CombatTab with missing features (✅ COMPLETE)
    - [x] 7.13.0 Add damage application and target selection
      - **COMPLETED:** DamageApplicator component with TargetSelector
      - **COMPLETED:** Apply damage to specific locations with armor ablation
      - _Requirements: 25.1_
    
    - [x] 7.13.1 Add initiative and stun/death save modifiers
      - Input fields for initiative modifier
      - Input fields for stun/death save modifier
      - Save modifiers to character
      - Apply modifiers to rolls automatically
      - _Requirements: 25.2_
      - **COMPLETED:** Modifier inputs below roll buttons
      - **COMPLETED:** Modifiers applied to dice rolls automatically
    
    - [x] 7.13.2 Add cyberweapons to weapons list
      - Filter enabled cyberweapons with weapon capabilities
      - Display alongside regular weapons
      - Support firing cyberweapons with attack dialogs
      - Show weapon type and attack type
      - _Requirements: 25.3, 25.4_
      - **COMPLETED:** Cyberweapons with weapon capabilities shown in weapons list
      - **COMPLETED:** Blue border/background to distinguish from regular weapons
    
    - [x] 7.13.3 Add SDP tracking for powered armor
      - Display SDP sum and current per location
      - Support manual SDP editing
      - Show SDP only when applicable (cyberlimbs)
      - Update SDP on damage
      - _Requirements: 25.5_
      - **COMPLETED:** SDP section shows only for cyberlimbs
      - **COMPLETED:** Editable SDP inputs with max/current tracking

  - [x] 7.14 Enhance SkillsTab with missing features (COMPLETE - Basic Version)
    - [x] 7.14.1 Add skill search functionality
      - Search input with real-time filtering
      - Clear search button
      - Maintain search state across renders
      - Filter skills by name (case-insensitive)
      - _Requirements: 26.1, 26.2_
      - **COMPLETED:** Search input with clear button in SkillsTab
    
    - [x] 7.14.2 Add skill sorting options
      - Dropdown with sort options (name, stat, value)
      - ~~Save sort preference to character~~ (Local state is fine)
      - Re-sort on option change
      - Maintain sort state across renders
      - _Requirements: 26.3_
      - **COMPLETED:** Sort dropdown with category/name/value options
    
    - [ ] 7.14.3 Add chip toggle indicators **TODO: LATER**
      - Visual indicator for chipped skills
      - Toggle button to activate/deactivate chips
      - Sync with chipware state
      - Update skill bonuses on toggle
      - _Requirements: 26.4, 26.5_
      - **STATUS:** Needs chipware manager (7.10.4) first
    
    - [x] 7.14.4 Maintain state across renders
      - Preserve search filter value
      - Preserve sort order
      - ~~Restore cursor position in search input~~ (Not needed)
      - _Requirements: 26.6_
      - **COMPLETED:** State maintained with useState

- [ ] 8. Checkpoint - Validate character sheet
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Supabase Realtime session sync
  - [x] 9.1 Create Realtime subscription module (e.g. `lib/realtime/session-channel.ts`)
    - Subscribe to `postgres_changes` for session-scoped tables: `characters`, `tokens`, `chat_messages`, etc.
    - Join a per-session Realtime channel (`session:${sessionId}`) with Supabase Auth
    - Handle subscribe errors, disconnect, and resubscribe after tab focus / network recovery
    - _Requirements: 1.2, 1.3, 10.2_
    - **COMPLETED:** `app/lib/realtime/session-channel.ts`, `connectSessionRealtime`, `attachSessionRealtimeRecovery`

  - [x] 9.2 Durable updates vs ephemeral broadcast
    - Persist important state to Postgres first (writes go through Supabase client + RLS); UI updates from `postgres_changes`
    - Use Realtime **`broadcast`** on the session channel for ephemeral payloads (e.g. roll_request UX, typing, optional token drag preview) that should not spam the database
    - Document which event types use rows vs broadcast to avoid conflicting sources of truth
    - _Requirements: 10.1_
    - **COMPLETED:** `app/lib/realtime/realtime-events.ts`

  - [x] 9.3 Implement client reconnection and state sync
    - On (re)connect: load authoritative snapshot from Postgres (session load / refetch), then attach Realtime subscriptions
    - Do not rely on broadcast alone for history—chat and character rows must be recoverable from the DB
    - _Requirements: 10.3_
    - **COMPLETED:** `fetchSessionSnapshot` + `connectSessionRealtime` / `recover()`

  - [x] 9.4 Write property test for client reconnection
    - **Property 22: Client Reconnection State Sync**
    - **Validates: Requirements 10.3**
    - **COMPLETED:** `app/lib/realtime/session-sync.property.test.ts`

  - [x] 9.5 Integrate Realtime with Zustand store
    - On outbound writes: optimistic local updates where helpful; reconcile from `postgres_changes`
    - Apply incoming Realtime payloads to the store; rollback optimistic rows on RLS/error rejection
    - _Requirements: 10.5_
    - **COMPLETED:** `hydrateFromLoadedSnapshot`, remote upserts, `beginOptimisticCharacterEdit` / `rollbackOptimisticCharacterEdit`, `createDefaultPostgresHandlersForGameStore`

  - [x] 9.6 Write property test for optimistic update rollback
    - **Property 23: Optimistic Update Rollback**
    - **Validates: Requirements 10.5**
    - **COMPLETED:** `app/lib/realtime/session-sync.property.test.ts`

- [x] 10. Implement AI-GM orchestrator
  - [x] 10.1 Create context-builder.ts for LLM context assembly
    - Build system prompt with core rules
    - Serialize character sheets to compact JSON
    - Add active scene description
    - Add recent chat history
    - _Requirements: 3.6, 4.1_
    - **COMPLETED:** `app/lib/gm/context-builder.ts`

  - [x] 10.2 Write property test for conversation context continuity
    - **Property 7: Conversation Context Continuity**
    - **Validates: Requirements 3.6**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts`

  - [x] 10.3 Create lorebook.ts for rule injection
    - Load rule files with keywords and priority
    - Implement keyword matching on player input
    - Sort by priority and enforce token budget
    - _Requirements: 4.1, 4.2, 4.3_
    - **COMPLETED:** `app/lib/gm/lorebook.ts`, `app/lib/gm/lore/default-rules.json`

  - [x] 10.4 Write property test for keyword-based rule injection
    - **Property 8: Keyword-Based Rule Injection**
    - **Validates: Requirements 4.1**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts`

  - [x] 10.5 Write property test for rule priority selection
    - **Property 9: Rule Priority Selection**
    - **Validates: Requirements 4.2**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts`

  - [x] 10.6 Write property test for token budget enforcement
    - **Property 10: Token Budget Enforcement**
    - **Validates: Requirements 4.3**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts`

  - [x] 10.7 Create tool-executor.ts for tool calling
    - Define tool schemas with validation
    - Implement tool handlers (18 tools total):
      - **Core:** apply_damage, deduct_money, add_item, remove_item, request_roll, move_token, generate_scenery, play_narration, lookup_rules, update_character_field
      - **Extended:** add_money, heal_damage, roll_dice (server-side for NPCs), equip_item, modify_skill, update_ammo, set_condition (with duration_rounds), update_summary, add_chat_as_npc
    - **Deferred tools** (to be added when their dependencies exist):
      - `add_token` / `remove_token` — blocked on Task 14 (Map & Token UI); `move_token` already works against the `tokens` table
      - `spawn_npc` — see Task 19; requires character creation logic and GM-owned character rows
      - `start_combat` / `advance_round` / `end_combat` — see Task 20; requires turn tracker / initiative system
    - **`request_roll`:** surface to the client as guidance (open dice roller, suggested formula)—does not replace player agency or enforce server-side randomness
    - **`roll_dice`:** server-side dice for NPC actions, random events; result posted to chat
    - **`set_condition`:** persistent status effects with optional duration (rounds); "stunned" toggles `isStunned` only, all other conditions stored in `conditions[]` JSONB
    - Validate parameters before execution
    - Execute state mutations and update database (Realtime propagates via `postgres_changes`)
    - _Requirements: 3.2, 3.3, 3.4_
    - **COMPLETED:** `app/lib/gm/tool-executor.ts`, `app/lib/gm/tool-definitions.ts`, `app/lib/gm/character-mutations.ts`

  - [x] 10.8 Write property test for tool parameter validation
    - **Property 6: Tool Parameter Validation**
    - **Validates: Requirements 3.3**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts`

  - [x] 10.9 Write property test for tool execution state changes
    - **Property 5: Tool Execution State Changes**
    - **Validates: Requirements 3.1, 3.4**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts`

  - [x] 10.10 Write property test for rule lookup tool
    - **Property 11: Rule Lookup Tool**
    - **Validates: Requirements 4.4**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts`

  - [x] 10.11 Create api/gm/route.ts for AI-GM endpoint
    - Assemble context with context-builder and lorebook
    - Call OpenRouter API (default: DeepSeek V3.2)
    - Parse tool calls from response
    - Execute tools via tool-executor
    - Return narration and state changes
    - Handle errors and retries
    - _Requirements: 3.1, 3.5, 16.1, 16.2_
    - **COMPLETED:** `app/app/api/gm/route.ts`, `app/lib/gm/openrouter.ts` — default model `deepseek/deepseek-v3.2` (override with `OPENROUTER_MODEL`)

  - [x] 10.12 Write property test for tool call error logging
    - **Property 31: Tool Call Error Logging**
    - **Validates: Requirements 16.1**
    - **COMPLETED:** `app/lib/gm/gm.property.test.ts` (validation surface); route logs failed tools with `console.error`

  - [x] 10.13 Implement persistent conditions system
    - [x] 10.13.1 Add conditions JSONB column to characters table
      - Created migration `003_character_conditions.sql` adding `conditions JSONB DEFAULT '[]'`
      - Updated `schema.sql` for fresh installs
      - **COMPLETED:** `app/lib/database/migrations/003_character_conditions.sql`

    - [x] 10.13.2 Add CharacterCondition type with duration tracking
      - `CharacterCondition { name: string; duration: number | null }` — duration in CP2020 rounds (~3s)
      - Updated `Character.conditions` from `string[]` to `CharacterCondition[]`
      - Updated serializer/deserializer with safe migration of legacy bare strings
      - **COMPLETED:** `app/lib/types.ts`, `app/lib/realtime/db-mapper.ts`, `app/lib/db/character-serialize.ts`

    - [x] 10.13.3 Add set_condition tool with duration support
      - `set_condition` tool accepts optional `duration_rounds` parameter
      - "stunned" toggles only `isStunned` (no conditions[] entry); "asleep"/"unconscious" also set `isStunned`
      - Conditions persisted on character row, synced via Realtime to all clients
      - Chat message posted with duration info (e.g. "Condition **blinded** applied to V (12 rounds)")
      - AI instructed to specify duration when CP2020 rules define one (e.g. Dazzle=12r, Sonic=12r, Incendiary=9r)
      - **COMPLETED:** `app/lib/gm/character-mutations.ts`, `app/lib/gm/tool-executor.ts`, `app/lib/gm/tool-definitions.ts`, `app/lib/gm/context-builder.ts`

    - [x] 10.13.4 Add condition badges and manual add/remove UI to WoundTracker
      - Color-coded condition badges with duration display (e.g. `BLINDED (12r)`)
      - Remove button (x) on each badge when editable
      - Add condition form: dropdown of common CP2020 conditions + custom option, duration input, 1d6 roll button
      - **COMPLETED:** `app/components/character/WoundTracker.tsx`

  - [x] 10.14 Create GM scenarios test page
    - Dev page at `/gm-scenarios` for testing AI-GM tool calls with predefined scenarios
    - 16 scenarios covering all tools: combat, money, healing, dice, equipment, skills, ammo, conditions, NPC dialogue, session summary, multi-tool chains, freeform
    - Sends requests to `/api/gm` and displays narration + tool results
    - **COMPLETED:** `app/app/gm-scenarios/GmScenariosClient.tsx`, `app/app/gm-scenarios/page.tsx`

  - [x] 10.15 Fix defensive stats deserialization
    - Replaced unsafe cast in `characterRowToCharacter` with `safeStats()` parser
    - Each stat key validated individually; missing/malformed stats fall back to `createStatBlock(1, 0)`
    - Added guard in `applyStatModifiers` for missing `stats.emp`
    - **COMPLETED:** `app/lib/realtime/db-mapper.ts`, `app/lib/game-logic/formulas.ts`

- [ ] 11. Checkpoint - Validate AI-GM integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Build Chat Interface component
  - [ ] 12.1 Create ChatInterface.tsx with message display
    - Display chat history with speaker names
    - Color-code messages by type (narration, player, system, roll)
    - Auto-scroll to latest message
    - _Requirements: 11.5_

  - [ ]* 12.2 Write property test for session history ordering
    - **Property 24: Session History Ordering**
    - **Validates: Requirements 11.5**

  - [ ] 12.3 Add text input for player messages
    - Text input with send button
    - Send message to AI-GM endpoint
    - Display AI response in chat
    - _Requirements: 3.1_

  - [ ] 12.4 Add dice roller UI
    - Display dice roller when AI-GM requests a roll
    - Show roll animation and results
    - Send results back to AI-GM
    - _Requirements: 12.1, 12.4, 12.5_

- [ ] 13. Implement voice processing
  - [ ] 13.1 Add audio capture with WebRTC
    - Request microphone permission
    - Capture audio stream from all participants
    - Stream audio chunks to server
    - _Requirements: 2.1_

  - [ ] 13.2 Create api/voice/route.ts for STT processing
    - Integrate with Deepgram or Azure Speech Services
    - Perform speaker diarization
    - Map speaker IDs to characters
    - Return transcript with speaker identity
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 13.3 Write property test for speaker-to-character mapping
    - **Property 3: Speaker-to-Character Mapping**
    - **Validates: Requirements 2.3**

  - [ ]* 13.4 Write property test for transcription message format
    - **Property 4: Transcription Message Format**
    - **Validates: Requirements 2.4**

  - [ ] 13.5 Create api/tts/route.ts for narration
    - Integrate with OpenAI TTS or ElevenLabs
    - Generate audio from AI-GM narration
    - Support voice style selection
    - Return audio stream
    - _Requirements: 9.1, 9.3_

  - [ ] 13.6 Add TTS playback to ChatInterface
    - Play TTS audio when narration is received
    - Queue multiple narrations
    - Add mute toggle
    - _Requirements: 9.2, 9.4, 9.5_

  - [ ]* 13.7 Write property test for narration queueing
    - **Property 21: Narration Queueing**
    - **Validates: Requirements 9.4**

- [ ] 14. Build Map and Token component
  - [ ] 14.1 Create MapCanvas.tsx with background image
    - Display map background image
    - Support custom map upload
    - _Requirements: 8.1, 8.5_

  - [ ] 14.2 Add token rendering and dragging
    - Render tokens at percentage positions
    - Implement drag-and-drop for player tokens
    - Distinguish player vs GM tokens
    - _Requirements: 8.2, 8.3, 8.6_

  - [ ]* 14.3 Write property test for token ownership
    - **Property 20: Token Ownership**
    - **Validates: Requirements 8.6**

  - [ ] 14.4 Integrate token movement with Realtime
    - Persist token `x,y` (and related fields) to Postgres; other clients receive updates via `postgres_changes`
    - Optional: `broadcast` for smooth drag preview; commit position on drag end
    - AI-GM `move_token` tool updates the same rows
    - _Requirements: 8.3, 8.4_

  - [ ] 14.5 Add `add_token` and `remove_token` AI tools _(deferred — blocked on 14.1–14.4)_
    - `add_token`: AI places a new token on the map (NPC, object, hazard marker) — inserts row into `tokens` table
    - `remove_token`: AI removes a token from the map (NPC defeated, object destroyed) — deletes row from `tokens` table
    - `move_token` already exists in tool-executor.ts and tool-definitions.ts; these two complete the set
    - **Current state:** `move_token` tool is implemented and functional against the `tokens` DB table; the Map UI (14.1–14.2) and token rows are not yet in active use
    - _Requirements: 8.2, 8.3_

- [ ] 15. Implement authentication and authorization
  - [ ] 15.1 Set up Supabase Auth
    - Configure email/password authentication
    - Add sign up, sign in, sign out flows
    - _Requirements: 15.1_

  - [ ]* 15.2 Write property test for authentication enforcement
    - **Property 28: Authentication Enforcement**
    - **Validates: Requirements 15.1**

  - [ ] 15.3 Add authorization checks to API routes
    - Validate JWT on all requests
    - Check character ownership before modifications
    - Check session creator permissions
    - _Requirements: 15.2, 15.3, 15.4_

  - [ ]* 15.4 Write property test for character ownership
    - **Property 29: Character Ownership**
    - **Validates: Requirements 15.2, 15.3**

  - [ ]* 15.5 Write property test for session creator permissions
    - **Property 30: Session Creator Permissions**
    - **Validates: Requirements 15.4**

- [ ] 16. Implement session persistence
  - [ ] 16.1 Add session save functionality
    - Save all characters, map state, chat history to database
    - Trigger save after significant changes
    - _Requirements: 11.1, 11.2_

  - [ ] 16.2 Add session load functionality
    - Load session data from database
    - Restore characters, map, chat history to store
    - _Requirements: 11.3_

  - [ ]* 16.3 Write property test for session persistence round-trip
    - **Property 1: Session Persistence Round-Trip**
    - **Validates: Requirements 1.4, 11.1, 11.2, 11.3**

- [ ] 17. Add error handling and validation
  - [ ] 17.1 Add input validation to all API routes
    - Validate request bodies against schemas
    - Return 422 for validation errors
    - _Requirements: 16.4_

  - [ ]* 17.2 Write property test for input validation
    - **Property 32: Input Validation**
    - **Validates: Requirements 16.4**

  - [ ] 17.3 Add error handling to AI-GM endpoint
    - Handle OpenRouter API failures with retries
    - Return fallback responses on errors
    - _Requirements: 16.2_

  - [ ] 17.4 Add error handling for Realtime subscriptions
    - Handle channel subscribe failures and connection drops gracefully
    - Implement client resubscribe / refetch after errors
    - _Requirements: 16.3_

  - [ ] 17.5 Add error logging
    - Log all errors with context
    - Set up error tracking (Sentry or similar)
    - _Requirements: 16.1_

- [ ] 18. Create rule files for lorebook _(deferred — engine complete, content expansion needed)_
    - **Current state:** Lorebook engine fully implemented (Task 10.3): keyword matching, priority sorting, token budget enforcement, `lookup_rules` tool. Only 4 basic rules exist in `app/lib/gm/lore/default-rules.json` (core-attributes, fnff-damage, netrunning-basic, economy-eurobucks).
    - **Format:** Rules live as JSON entries in `default-rules.json` with `{ id, keywords[], priority, content }`. Task originally called for separate `.md` files with YAML frontmatter — either approach works, but the current JSON format is already wired into `lorebook.ts`.

  - [ ] 18.1 Write core rule files
    - combat-basics: turn order, actions per round, initiative (REF + 1d10), fumble tables
    - damage-pipeline: hit roll → location → SP → BTM → wound track → stun/death saves
    - skill-checks: DC table (Easy 10, Average 15, Difficult 20, Very Difficult 25, Nearly Impossible 30), modifiers
    - _Requirements: 4.5_

  - [ ] 18.2 Write topic rule files
    - ranged-combat: range DCs by weapon type, fire modes (single/burst/full-auto), aimed shots, cover modifiers
    - melee-combat: melee attacks, martial arts actions and bonuses, grappling
    - autofire: full auto hit calculation (1 hit per point over DC), burst fire, suppressive fire zones
    - netrunning: interface skill, programs, ICE types, NET architecture, Netrunner actions per turn
    - cyberware-rules: humanity cost, installation difficulty, therapy, cyberpsychosis threshold
    - vehicle-combat: vehicle SP/SDP, control rolls, chase rules, ramming
    - shopping: availability rolls by city size, street deals, fixer contacts, cost modifiers
    - grenades-explosives: blast radius, dazzle/flashbang/smoke/incendiary/frag effects and durations
    - drugs-pharmaceuticals: common drugs (speedheal, stim, dorph), effects, addiction, overdose
    - _Requirements: 4.5_

  - [ ] 18.3 Add keyword metadata to all rule files
    - Ensure each rule has comprehensive `keywords[]` for reliable matching
    - Set appropriate `priority` (higher = injected first under budget)
    - Test against common player queries to verify coverage
    - _Requirements: 4.1_

- [ ] 19. Implement NPC spawning system _(deferred)_
  - GM AI tool to create NPC character sheets on-the-fly during a session
  - **Depends on:** Task 14 (Map & Tokens) for optional token placement, schema support for GM-owned characters

  - [ ] 19.1 Add GM ownership model for characters
    - Schema change: allow `user_id` to be null or a GM sentinel value for NPC rows
    - Update RLS policies so GM can read/write NPC characters in their sessions
    - Update `characterRowToCharacter` to flag NPC characters (e.g. `isNpc: boolean`)

  - [ ] 19.2 Create NPC role templates
    - Define stat/skill/equipment templates for common CP2020 roles: Solo, Netrunner, Techie, Fixer, Nomad, Corp, Cop, etc.
    - Each template provides baseline stats, role skill, typical weapons/armor, and a threat-level scaler
    - Source from CP2020 NPC stat blocks in `CP2020Gameplay.md` / `CP2020Character.md`

  - [ ] 19.3 Implement `spawn_npc` AI tool
    - Accepts parameters: name, role, approximate threat level, optional stat overrides
    - Populates Character from role template, inserts into `characters` table linked to current session
    - Syncs via Realtime to all clients
    - Optionally places a token on the map if Task 14 is complete (`add_token` call)
    - Post chat message announcing the NPC (e.g. "A **Corporate Solo** appears — Viktor, armed with an FN-RAL")

  - [ ] 19.4 Add NPC management UI
    - GM-visible NPC list in the session room (distinct from player characters)
    - Quick-edit panel for NPC stats/equipment
    - Remove/archive NPC button

- [ ] 20. Implement turn tracker / initiative system _(deferred)_
  - Track combat rounds and initiative order within a session
  - **Depends on:** Task 12 (Chat Interface) for round announcements

  - [ ] 20.1 Design initiative data model
    - `combat_state` on session or separate table: round counter, active character index
    - `initiative_entries`: character_id, initiative roll (REF + 1d10), sort order
    - Persisted in Postgres, synced via Realtime

  - [ ] 20.2 Implement `start_combat` AI tool
    - Roll initiative for all characters in the session (REF + 1d10 per CP2020)
    - Create initiative order, set round to 1
    - Post initiative results to chat

  - [ ] 20.3 Implement `advance_round` AI tool
    - Increment round counter
    - Auto-decrement `duration` on all `CharacterCondition` entries across session characters
    - Remove expired conditions (duration reaches 0), post removals to chat
    - Post round summary (e.g. "— Round 3 begins — Blinded cleared from V")

  - [ ] 20.4 Implement `end_combat` AI tool
    - Clear initiative order and combat state
    - Optionally clear temporary combat-only conditions
    - Post combat-end narration to chat

  - [ ] 20.5 Build initiative tracker UI
    - Initiative sidebar/bar showing turn order with active character highlight
    - Round counter display
    - Manual "next turn" / "advance round" buttons for GM
    - Visual indicator on character sheets when it's their turn

- [ ] 21. Polish UI and styling
  - [ ] 21.1 Apply cyberpunk theme to all components
    - Use color palette from Foundry SCSS
    - Add grid patterns and neon accents
    - Use OpenSans-ExtraBold font
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ] 21.2 Make UI responsive
    - Test on desktop and tablet screens
    - Adjust layouts for different screen sizes
    - _Requirements: 14.5_

  - [ ] 21.3 Add loading states and animations
    - Show loading spinners during AI-GM responses
    - Add dice roll animations
    - Add token movement animations

- [ ] 22. Final checkpoint - Integration testing
  - Test complete game flow: character creation → combat → shopping → session save/load
  - Test multiplayer with multiple clients
  - Test voice input and TTS narration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 23. Deployment preparation
  - [ ] 23.1 Set up production environment variables
    - Configure secrets on the target host (VPS process manager, Docker, or Vercel/hosting dashboard)
    - Configure Supabase production database and Realtime
    - _Requirements: 18.2_

  - [ ] 23.2 Deploy Next.js (VPS or cloud)
    - **Preferred:** build and run Next.js on a VPS (Node, systemd, PM2, or Docker) for predictable API + long-running behavior
    - **Alternative:** Vercel or similar if compatible with the chosen stack
    - _Requirements: 18.1_

  - [ ] 23.3 Write deployment documentation
    - Document setup steps
    - Document environment variables
    - Document database schema setup
    - _Requirements: 18.4_

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties with 100+ iterations each
- Unit tests validate specific examples and edge cases
- The implementation follows a bottom-up approach: game logic → data layer → UI → AI integration → real-time features
- All tests are required to ensure comprehensive correctness validation from the start
- A **custom Node WebSocket server (Socket.io, etc.)** is an optional future escalation if Realtime limits or product needs change; it is not required for the current plan
