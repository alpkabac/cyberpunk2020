# Requirements Document: AI-GM Multiplayer Cyberpunk 2020 App

## Introduction

A real-time multiplayer application for playing Cyberpunk 2020 TTRPG with an AI Game Master. The system supports voice input via STT with speaker diarization, AI-driven narration with TTS, character sheet management, combat automation, shopping, and a simple map with token support. The AI-GM uses tool calling to mutate game state and a lorebook system for rule injection.

## Glossary

- **AI-GM**: The AI Game Master that narrates, adjudicates rules, controls NPCs, and manages game state via tool calls
- **STT**: Speech-to-Text conversion system for player voice input
- **TTS**: Text-to-Speech system for AI narration output
- **Speaker_Diarization**: Technology that identifies and separates different speakers in audio
- **Tool_Calling**: LLM feature that allows the AI to execute functions that mutate game state
- **Lorebook**: Keyword-triggered rule injection system for providing context-specific rules to the AI
- **Character_Sheet**: Digital representation of a player character with stats, skills, inventory, and wound tracking
- **Token**: Visual representation of a character or NPC on the game map
- **SP**: Stopping Power - armor's damage reduction value
- **BTM**: Body Type Modifier - damage reduction based on character's body type
- **Session_State**: The current game state including all characters, NPCs, map, and session history
- **Real-time_Sync**: Sub-second synchronization of game state across all connected clients
- **OpenRouter**: API gateway for accessing multiple LLM providers
- **GLM_4.7**: The specific LLM model to be used via OpenRouter

## Requirements

### Requirement 1: Platform Architecture

**User Story:** As a developer, I want to choose the optimal platform architecture, so that the app delivers real-time performance while being easy to deploy and maintain.

#### Acceptance Criteria

1. THE System SHALL be deployable as a web application accessible via modern browsers
2. THE System SHALL support real-time state synchronization with latency under 500ms
3. THE System SHALL use WebSocket connections for bidirectional real-time communication
4. THE System SHALL persist game state to a database for session continuity
5. THE System SHALL support concurrent multiplayer sessions without interference

### Requirement 2: Voice Input with Speaker Diarization

**User Story:** As a player, I want to speak naturally during gameplay, so that the AI-GM can identify who is speaking and respond appropriately.

#### Acceptance Criteria

1. WHEN players speak, THE System SHALL capture audio from all participants
2. WHEN audio is captured, THE System SHALL perform speaker diarization to identify individual speakers
3. WHEN a speaker is identified, THE System SHALL associate their speech with their character
4. WHEN speech is transcribed, THE System SHALL send the text with speaker identity to the AI-GM
5. THE System SHALL handle overlapping speech gracefully without losing context
6. THE System SHALL support continuous audio streaming with minimal latency

### Requirement 3: AI-GM with Tool Calling

**User Story:** As a player, I want the AI-GM to manage game state automatically, so that combat, shopping, and other mechanics happen seamlessly.

#### Acceptance Criteria

1. WHEN the AI-GM narrates an action, THE System SHALL execute corresponding tool calls to update game state
2. THE AI-GM SHALL have access to tools for: apply_damage, deduct_money, add_item, remove_item, request_roll, move_token, generate_scenery, play_narration, lookup_rules, update_character_field
3. WHEN a tool is called, THE System SHALL validate parameters before execution
4. WHEN a tool executes, THE System SHALL update the database and broadcast changes to all clients
5. THE System SHALL use OpenRouter API with GLM 4.7 model for AI-GM inference
6. THE System SHALL maintain conversation context across multiple turns

### Requirement 4: Lorebook Rule Injection

**User Story:** As a game designer, I want the AI-GM to access relevant rules dynamically, so that it adjudicates correctly without overwhelming the context window.

#### Acceptance Criteria

1. WHEN player input contains keywords, THE System SHALL inject matching rule entries into AI context
2. THE System SHALL support keyword-based rule matching with priority levels
3. THE System SHALL limit injected rules to stay within token budget
4. WHEN the AI-GM calls lookup_rules tool, THE System SHALL fetch and inject the requested topic
5. THE System SHALL maintain a library of rule files covering: combat-basics, damage-pipeline, skill-checks, ranged-combat, melee-combat, autofire, netrunning, cyberware-rules, vehicle-combat, shopping

### Requirement 5: Character Sheet Management

**User Story:** As a player, I want to view and manage my character sheet, so that I can track stats, skills, inventory, and wounds accurately.

#### Acceptance Criteria

1. THE Character_Sheet SHALL compute derived stats automatically (BTM, wound penalties, armor SP layering, humanity, movement)
2. WHEN stats change, THE System SHALL recalculate all dependent values immediately
3. THE Character_Sheet SHALL display: stats, skills, wound track, hit locations with SP, inventory, eurobucks, cyberware, netrunning deck
4. WHEN armor is equipped, THE System SHALL calculate layered SP using the combineSP formula
5. WHEN damage is taken, THE System SHALL update wound state and apply stat penalties
6. THE Character_Sheet SHALL support manual editing of all base values

### Requirement 6: Combat Automation

**User Story:** As a player, I want combat to be automated by the AI-GM, so that damage, armor, and wound tracking happen without manual calculation.

#### Acceptance Criteria

1. WHEN the AI-GM resolves an attack, THE System SHALL apply the damage pipeline: roll damage → head multiplier → subtract SP → subtract BTM → apply remaining damage
2. WHEN armor absorbs damage, THE System SHALL reduce SP by 1 (ablation)
3. WHEN damage is applied, THE System SHALL update the character's damage total and wound state
4. WHEN a character reaches a new wound threshold, THE System SHALL apply stat penalties automatically
5. THE System SHALL support hit location targeting with the d10 hit location table

### Requirement 7: Shopping System

**User Story:** As a player, I want to buy items from the AI-GM, so that I can acquire weapons, armor, cyberware, and gear.

#### Acceptance Criteria

1. WHEN a player requests to buy an item, THE AI-GM SHALL check if the item exists in the catalog
2. WHEN an item is purchased, THE AI-GM SHALL call deduct_money and add_item tools
3. THE System SHALL validate that the character has sufficient eurobucks before purchase
4. THE System SHALL maintain catalogs of: weapons, armor, cyberware, gear, vehicles with accurate costs
5. WHEN a purchase fails, THE AI-GM SHALL explain why and suggest alternatives

### Requirement 8: Map and Token System

**User Story:** As a player, I want to see a map with tokens, so that I can visualize character positions and movement.

#### Acceptance Criteria

1. THE System SHALL display a map with a background image
2. THE System SHALL render tokens as draggable elements positioned by percentage coordinates
3. WHEN a player drags their token, THE System SHALL update position in real-time for all clients
4. WHEN the AI-GM moves an NPC token, THE System SHALL call move_token tool
5. THE System SHALL support uploading custom map images
6. THE System SHALL distinguish between player-controlled and GM-controlled tokens

### Requirement 9: Text-to-Speech Narration

**User Story:** As a player, I want to hear the AI-GM's narration, so that the game feels more immersive.

#### Acceptance Criteria

1. WHEN the AI-GM generates narration, THE System SHALL convert text to speech
2. THE System SHALL play TTS audio for all connected players
3. THE System SHALL support voice style selection (dramatic, calm, gruff, etc.)
4. THE System SHALL queue multiple narrations to prevent overlap
5. THE System SHALL allow players to mute TTS if desired

### Requirement 10: Real-time State Synchronization

**User Story:** As a player, I want to see game state changes instantly, so that combat and interactions feel responsive.

#### Acceptance Criteria

1. WHEN any game state changes, THE System SHALL broadcast updates to all connected clients within 500ms
2. THE System SHALL use WebSocket connections for real-time communication
3. WHEN a client reconnects, THE System SHALL sync the current game state
4. THE System SHALL handle network interruptions gracefully without data loss
5. THE System SHALL support optimistic updates with rollback on conflict

### Requirement 11: Session Persistence

**User Story:** As a player, I want my game session to be saved, so that I can resume later without losing progress.

#### Acceptance Criteria

1. THE System SHALL persist all game state to a database after each significant change
2. THE System SHALL save: character data, session history, map state, NPC data, inventory
3. WHEN a session is loaded, THE System SHALL restore all characters and game state
4. THE System SHALL support multiple concurrent sessions without interference
5. THE System SHALL maintain session history for AI context

### Requirement 12: Dice Rolling System

**User Story:** As a player, I want to roll dice when requested, so that skill checks and attacks are resolved fairly.

#### Acceptance Criteria

1. WHEN the AI-GM requests a roll, THE System SHALL display a dice roller UI to the player
2. THE System SHALL implement exploding d10 (reroll and add on 10)
3. THE System SHALL support dice formulas: XdY, XdY+Z, 1d10x10
4. WHEN a roll is made, THE System SHALL display individual die results and total
5. THE System SHALL send roll results to the AI-GM for adjudication

### Requirement 13: Data Extraction from Foundry

**User Story:** As a developer, I want to extract game data from the Foundry system, so that the app has accurate weapons, armor, skills, and rules.

#### Acceptance Criteria

1. THE System SHALL export Foundry compendium data to JSON format
2. THE System SHALL extract: weapons, armor, cyberware, skills, gear, vehicles with full stats and costs
3. THE System SHALL convert Foundry data schemas to app data models
4. THE System SHALL extract game formulas from actor.js and lookups.js
5. THE System SHALL maintain data integrity during extraction

### Requirement 14: Cyberpunk Visual Theme

**User Story:** As a player, I want the app to look like Cyberpunk 2020, so that it feels authentic to the setting.

#### Acceptance Criteria

1. THE System SHALL use a cyberpunk-themed color palette extracted from the Foundry SCSS
2. THE System SHALL use appropriate fonts (OpenSans-ExtraBold or similar)
3. THE System SHALL display character sheets with a retro-futuristic aesthetic
4. THE System SHALL use grid patterns and neon accents consistent with the genre
5. THE System SHALL be responsive and work on desktop and tablet screens

### Requirement 15: Authentication and Authorization

**User Story:** As a player, I want to log in securely, so that only I can control my character.

#### Acceptance Criteria

1. THE System SHALL require authentication before accessing game sessions
2. THE System SHALL associate each user with their character(s)
3. THE System SHALL prevent players from modifying other players' characters
4. THE System SHALL allow the session creator to manage the session
5. THE System SHALL support guest access for quick testing

### Requirement 16: Error Handling and Recovery

**User Story:** As a player, I want the app to handle errors gracefully, so that technical issues don't ruin the game.

#### Acceptance Criteria

1. WHEN an AI-GM tool call fails, THE System SHALL log the error and notify the AI-GM
2. WHEN the LLM API is unavailable, THE System SHALL display a clear error message
3. WHEN a WebSocket connection drops, THE System SHALL attempt reconnection automatically
4. WHEN invalid data is received, THE System SHALL validate and reject it safely
5. THE System SHALL provide user-friendly error messages without exposing technical details

### Requirement 17: Performance and Scalability

**User Story:** As a developer, I want the app to perform well, so that players have a smooth experience.

#### Acceptance Criteria

1. THE System SHALL support at least 6 concurrent players per session
2. THE System SHALL respond to user actions within 200ms (excluding AI inference)
3. THE System SHALL handle AI-GM responses within 5 seconds for typical queries
4. THE System SHALL optimize database queries to minimize latency
5. THE System SHALL use caching for static game data (weapons, armor, skills)

### Requirement 18: Development and Deployment

**User Story:** As a developer, I want clear deployment options, so that I can host the app reliably.

#### Acceptance Criteria

1. THE System SHALL be deployable to cloud platforms (Vercel, Railway, Fly.io)
2. THE System SHALL use environment variables for API keys and configuration
3. THE System SHALL include a development mode with hot reloading
4. THE System SHALL provide clear documentation for setup and deployment
5. THE System SHALL use a managed database service (Supabase, Firebase, or PostgreSQL)

### Requirement 19: Player Item Management

**User Story:** As a player, I want to browse and manage items directly, so that I can equip gear without relying on the AI-GM.

#### Acceptance Criteria

1. THE System SHALL provide an item browser showing all available weapons, armor, cyberware, gear, and vehicles
2. THE System SHALL support searching and filtering items by type, name, and cost
3. WHEN a player selects an item, THE System SHALL display full stats and description
4. THE System SHALL allow players to add items to their inventory directly
5. THE System SHALL support drag-and-drop for moving items between inventory and equipment slots
6. THE System SHALL allow players to delete items from their inventory

### Requirement 20: Shopping Interface

**User Story:** As a player, I want to purchase items directly, so that I can shop without waiting for AI-GM responses.

#### Acceptance Criteria

1. THE System SHALL provide a shopping interface with item catalog and prices
2. WHEN a player attempts to purchase an item, THE System SHALL validate sufficient eurobucks
3. WHEN a purchase is successful, THE System SHALL deduct money and add item to inventory
4. WHEN a purchase fails, THE System SHALL display clear error message
5. THE System SHALL support both player-initiated and AI-GM-initiated purchases

### Requirement 21: Cyberware Installation

**User Story:** As a player, I want to install cyberware to body zones, so that I can manage my character's augmentations.

#### Acceptance Criteria

1. THE System SHALL display a body diagram with zones: Head, Torso, Arms (L/R), Legs (L/R), Nervous
2. THE System SHALL support drag-and-drop to install cyberware to appropriate zones
3. WHEN cyberware is installed, THE System SHALL calculate humanity loss automatically
4. THE System SHALL prevent installing incompatible cyberware to wrong zones
5. THE System SHALL display all installed cyberware per zone with humanity cost
6. THE System SHALL support uninstalling cyberware back to inventory

### Requirement 22: Chipware Management

**User Story:** As a player, I want to manage skill chips, so that I can activate/deactivate chip skills.

#### Acceptance Criteria

1. THE System SHALL display active chipware slots with visual chip icons
2. THE System SHALL support drag-and-drop to activate/deactivate chips
3. WHEN a chip is activated, THE System SHALL apply skill bonuses automatically
4. WHEN a chip is deactivated, THE System SHALL remove skill bonuses
5. THE System SHALL show which skills are affected by each chip
6. THE System SHALL display chip tooltips with full names on hover

### Requirement 23: Armor Equipment

**User Story:** As a player, I want to equip armor to specific hit locations, so that I can optimize my protection.

#### Acceptance Criteria

1. THE System SHALL allow assigning armor to specific hit locations
2. THE System SHALL display armor coverage for each piece
3. WHEN armor is equipped, THE System SHALL calculate layered SP per location
4. THE System SHALL calculate and display encumbrance penalty
5. THE System SHALL support unequipping armor pieces

### Requirement 24: Program Management

**User Story:** As a player, I want to manage netrunning programs, so that I can configure my cyberdeck.

#### Acceptance Criteria

1. THE System SHALL display program inventory with icons and stats
2. THE System SHALL support drag-and-drop to activate programs
3. WHEN a program is activated, THE System SHALL validate RAM availability
4. THE System SHALL display active programs with visual indicators
5. THE System SHALL track used/max RAM in real-time
6. THE System SHALL support deactivating programs via right-click

### Requirement 25: Combat Interface Enhancements

**User Story:** As a player, I want to manage combat modifiers and see all my weapons, so that I can participate in combat effectively.

#### Acceptance Criteria

1. THE System SHALL provide input fields for initiative modifiers
2. THE System SHALL provide input fields for stun/death save modifiers
3. THE System SHALL display enabled cyberweapons in the weapons list
4. THE System SHALL support firing cyberweapons with attack dialogs
5. THE System SHALL display SDP tracking for powered armor when applicable

### Requirement 26: Skills Interface Enhancements

**User Story:** As a player, I want to search and sort skills, so that I can find skills quickly.

#### Acceptance Criteria

1. THE System SHALL provide a search input with real-time skill filtering
2. THE System SHALL provide a clear button to reset search
3. THE System SHALL provide sorting options (by name, stat, value)
4. THE System SHALL display visual indicators for chipped skills
5. THE System SHALL provide toggle buttons to activate/deactivate skill chips
6. THE System SHALL maintain search and sort state across renders
