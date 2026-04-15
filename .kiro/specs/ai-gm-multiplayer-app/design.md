# Design Document: AI-GM Multiplayer Cyberpunk 2020 App

## Overview

This application is a real-time multiplayer web platform for playing Cyberpunk 2020 TTRPG with an AI Game Master. The architecture follows a client-server model with **Supabase Realtime** for synchronization: **PostgreSQL** is authoritative, with **`postgres_changes`** subscriptions for durable updates and optional **`broadcast`** for ephemeral UI events. Voice input uses STT (HTTP from Next.js Route Handlers to STT providers or self-hosted endpoints); AI-driven game state management uses **tool calling** from Route Handlers.

The system is built on Next.js 14+ with React for the frontend, Supabase for database, Realtime, and authentication, and integrates with OpenRouter (GLM 4.7) for AI-GM inference via **server-side** API routes. Voice processing uses browser **getUserMedia** / MediaRecorder for capture, STT over HTTP, and TTS for narration output. **Tabletop trust:** client-side dice; no server roll enforcement in the baseline design.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Browser)                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Character    │  │ Map + Tokens │  │ Chat + Voice UI  │  │
│  │ Sheet UI     │  │ (Canvas/SVG) │  │ (STT/TTS)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Zustand Store (Client State)                  │   │
│  │  • Characters  • Map State  • Session History        │   │
│  └──────────────────────────────────────────────────────┘   │
│                    ↕ Supabase Realtime                       │
└──────────────────────────────────────────────────────────────┘
                           ↕
┌──────────────────────────────────────────────────────────────┐
│                  Next.js Server (Route Handlers)             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ (no custom   │  │ AI-GM        │  │ Voice / STT /    │  │
│  │  WS server)  │  │ Orchestrator │  │ TTS HTTP APIs    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Game Logic Layer                              │   │
│  │  • Formulas  • Dice  • Tool Executor  • Lorebook     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                           ↕
┌──────────────────────────────────────────────────────────────┐
│                    External Services                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Supabase     │  │ OpenRouter   │  │ STT/TTS Service  │  │
│  │ (DB + Auth)  │  │ (GLM 4.7)    │  │ (Deepgram/Azure) │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- Next.js 14+ (App Router)
- React 18+ (Client Components for interactivity)
- Zustand (Client state management)
- Tailwind CSS (Styling with cyberpunk theme)
- `getUserMedia` / MediaRecorder (Audio capture; upload to STT via HTTP)
- Canvas API or React-DnD (Map and token rendering)

**Backend:**
- Next.js Route Handlers (`app/api/.../route.ts`) — REST endpoints for AI-GM, STT, TTS; secrets stay server-side
- Node.js runtime (same process as Next on VPS or serverless handlers on cloud hosts)

**Database & Auth:**
- Supabase (PostgreSQL + Realtime + Auth)

**External APIs:**
- OpenRouter API (LLM inference with GLM 4.7)
- Deepgram or Azure Speech Services (STT with speaker diarization)
- OpenAI TTS or ElevenLabs (Text-to-speech)

**Deployment:**
- **Preferred:** VPS or container host running Next.js (predictable API + env)
- **Alternative:** Vercel or similar for frontend/API if compatible with hosting constraints
- Supabase Cloud (Database + Realtime + Auth)

## Components and Interfaces

### 1. Client Components

#### CharacterSheet Component
```typescript
interface CharacterSheetProps {
  characterId: string;
  editable: boolean;
}

// Displays and manages character data
// Computes derived stats (BTM, wound penalties, SP layering)
// Emits events for stat changes
```

#### MapCanvas Component
```typescript
interface MapCanvasProps {
  mapImageUrl: string;
  tokens: Token[];
  onTokenMove: (tokenId: string, x: number, y: number) => void;
}

interface Token {
  id: string;
  name: string;
  imageUrl: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  size: number; // pixels
  controlledBy: 'player' | 'gm';
}

// Renders map background and draggable tokens
// Handles drag-and-drop for player tokens
// Receives real-time updates for NPC token movement
```

#### ChatInterface Component
```typescript
interface ChatInterfaceProps {
  sessionId: string;
  currentUserId: string;
}

interface ChatMessage {
  id: string;
  speaker: string; // character name or "GM"
  text: string;
  timestamp: number;
  type: 'narration' | 'player' | 'system' | 'roll';
}

// Displays chat history
// Handles voice input (STT)
// Plays TTS narration
// Shows dice roll UI when requested
```

#### DiceRoller Component
```typescript
interface DiceRollerProps {
  formula: string; // e.g., "1d10x10+5"
  onRoll: (result: RollResult) => void;
}

interface RollResult {
  total: number;
  rolls: number[];
  formula: string;
}

// Visual dice roller with animation
// Implements exploding d10 logic
// Parses dice formulas
```

#### ItemBrowser Component
```typescript
interface ItemBrowserProps {
  itemType: 'weapon' | 'armor' | 'cyberware' | 'gear' | 'vehicle' | 'all';
  onSelectItem: (item: Item) => void;
  onAddToInventory: (item: Item) => void;
}

// Searchable, filterable catalog of all items
// Displays item cards with stats and prices
// Supports adding to inventory or purchasing
// Includes search input and type filters
```

#### ShopInterface Component
```typescript
interface ShopInterfaceProps {
  characterId: string;
  availableItems: Item[];
  onPurchase: (item: Item) => Promise<void>;
}

// Shopping UI with item browser
// Shows character's current eurobucks
// Handles purchase transactions
// Validates affordability
// Displays purchase confirmation dialogs
```

#### CyberwareInstaller Component
```typescript
interface CyberwareInstallerProps {
  character: Character;
  onInstall: (cyberware: Cyberware, zone: Zone) => void;
  onUninstall: (cyberware: Cyberware) => void;
}

interface Zone {
  name: 'head' | 'body' | 'nervous' | 'l-arm' | 'r-arm' | 'l-leg' | 'r-leg';
  installedCyberware: Cyberware[];
}

// Body diagram with drag-and-drop zones
// Shows installed cyberware per zone
// Calculates humanity loss in real-time
// Validates zone compatibility
// Displays anatomy SVG with zones
```

#### ChipwareManager Component
```typescript
interface ChipwareManagerProps {
  character: Character;
  activeChips: Cyberware[];
  onActivate: (chip: Cyberware) => void;
  onDeactivate: (chip: Cyberware) => void;
}

// Displays active chip slots with visual icons
// Shows chip tooltips on hover
// Supports drag-and-drop chip activation
// Displays affected skills per chip
// Syncs chip state with skill bonuses
```

#### DragDropInventory Component
```typescript
interface DragDropInventoryProps {
  items: Item[];
  onDrop: (item: Item, target: DropTarget) => void;
  onDelete: (item: Item) => void;
}

interface DropTarget {
  type: 'inventory' | 'equipment' | 'body-zone' | 'active-programs' | 'active-chips';
  zone?: string;
}

// Drag-and-drop item management
// Supports multiple drop targets (inventory, equipment, body zones)
// Visual feedback during drag
// Handles item deletion with confirmation
```

#### ArmorEquipper Component
```typescript
interface ArmorEquipperProps {
  character: Character;
  armor: Armor[];
  onEquip: (armor: Armor, locations: string[]) => void;
  onUnequip: (armor: Armor) => void;
}

// Displays hit locations with current SP
// Shows armor coverage per piece
// Calculates layered SP per location
// Displays encumbrance penalty
// Supports drag-and-drop armor assignment
```

#### ProgramManager Component
```typescript
interface ProgramManagerProps {
  character: Character;
  programs: Program[];
  activePrograms: Program[];
  onActivate: (program: Program) => void;
  onDeactivate: (program: Program) => void;
  onEdit: (program: Program) => void;
  onDelete: (program: Program) => void;
}

// Displays program inventory with icons
// Shows program stats (MU, type, cost)
// Supports drag-and-drop to activate
// Validates RAM availability
// Tracks used/max RAM in real-time
// Right-click to deactivate programs
```

#### CombatModifiers Component
```typescript
interface CombatModifiersProps {
  character: Character;
  onInitiativeModChange: (mod: number) => void;
  onStunDeathModChange: (mod: number) => void;
}

// Input fields for initiative modifiers
// Input fields for stun/death save modifiers
// Persists modifiers to character
// Applies modifiers to rolls
```

#### WeaponsList Component
```typescript
interface WeaponsListProps {
  weapons: Weapon[];
  cyberweapons: Cyberware[];
  onFire: (weapon: Weapon | Cyberware) => void;
  onEdit: (weapon: Weapon | Cyberware) => void;
}

// Displays regular weapons
// Displays enabled cyberweapons with weapon capabilities
// Supports firing with modifier dialogs
// Shows weapon type and attack type
```

#### SkillsEnhanced Component
```typescript
interface SkillsEnhancedProps {
  skills: Skill[];
  searchFilter: string;
  sortOrder: 'name' | 'stat' | 'value';
  onSearchChange: (filter: string) => void;
  onSortChange: (order: string) => void;
  onChipToggle: (skill: Skill) => void;
  onRoll: (skill: Skill) => void;
}

// Search input with real-time filtering
// Clear search button
// Sort dropdown (name, stat, value)
// Visual chip indicators
// Chip toggle buttons
// Maintains search/sort state
```

### 2. Server Components

#### Real-time sync (Supabase Realtime)

Durable state changes are written to PostgreSQL (via Supabase client + RLS). Clients subscribe with **`postgres_changes`** filtered by `session_id`. Ephemeral events (e.g. roll-request UX, typing indicators, optional live drag preview) may use **`channel.broadcast`** on `session:${sessionId}` without persisting every event.

```typescript
// Durable: characters, tokens, chat_messages — subscribe to postgres_changes
// Ephemeral: { event: 'roll_prompt', ... } — channel.broadcast, optional

interface SessionBroadcastPayload {
  event: 'roll_request' | 'typing' | 'token_drag' | string;
  payload: Record<string, unknown>;
}

// Reconnect: refetch session from DB, then channel.subscribe() again
```

#### AI-GM Orchestrator
```typescript
interface AIGMRequest {
  sessionId: string;
  messages: ChatMessage[];
  characters: Character[];
  activeScene: Scene;
}

interface AIGMResponse {
  narration: string;
  toolCalls: ToolCall[];
  ttsAudio?: string;
}

interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

// Assembles context for LLM (system prompt + characters + lorebook)
// Calls OpenRouter API with GLM 4.7
// Executes tool calls via ToolExecutor
// Returns narration and state changes
```

#### ToolExecutor
```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: (params: any, context: ExecutionContext) => Promise<void>;
}

// Validates tool call parameters
// Executes state mutations (apply_damage, deduct_money, etc.)
// Updates database; Realtime delivers changes to subscribers (postgres_changes)
// request_roll: guidance only — opens client dice roller; no server RNG requirement
```

#### Lorebook System
```typescript
interface LorebookEntry {
  keywords: string[];
  content: string;
  priority: number;
  maxTokens: number;
}

// Scans player messages for keywords
// Injects matching rule entries into AI context
// Respects token budget and priority
```

#### Voice Processing Service
```typescript
interface VoiceProcessingRequest {
  audioChunk: Buffer;
  sessionId: string;
}

interface VoiceProcessingResponse {
  transcript: string;
  speakerId: string;
  characterId?: string;
}

// Streams audio to STT service
// Performs speaker diarization
// Maps speakers to characters
// Returns transcribed text with speaker identity
```

### 3. Data Models

#### Character Model
```typescript
interface Character {
  id: string;
  userId: string;
  sessionId: string;
  name: string;
  type: 'character' | 'npc';
  imageUrl: string;
  
  // Info
  role: Role;
  age: number;
  points: number;
  
  // Stats (each has base + tempMod, total is computed)
  stats: {
    int: StatBlock;
    ref: StatBlock;
    tech: StatBlock;
    cool: StatBlock;
    attr: StatBlock;
    luck: StatBlock;
    ma: StatBlock;
    bt: StatBlock;
    emp: StatBlock;
  };
  
  // Skills
  skills: Skill[];
  
  // Wound tracking
  damage: number;
  
  // Hit locations with SP
  hitLocations: {
    Head: HitLocation;
    Torso: HitLocation;
    rArm: HitLocation;
    lArm: HitLocation;
    lLeg: HitLocation;
    rLeg: HitLocation;
  };
  
  // SDP for cyberlimbs
  sdp: {
    sum: Record<Zone, number>;
    current: Record<Zone, number>;
  };
  
  // Gear
  eurobucks: number;
  items: Item[];
  
  // Netrunning
  netrunDeck: NetrunDeck;
  
  // Lifepath
  lifepath: Lifepath;
  
  // Computed fields (not stored)
  derivedStats?: DerivedStats;
}

interface StatBlock {
  base: number;
  tempMod: number;
}

interface HitLocation {
  location: number[];
  stoppingPower: number;
  ablation: number;
}

interface DerivedStats {
  btm: number;
  run: number;
  leap: number;
  carry: number;
  lift: number;
  humanity: number;
  currentEmp: number;
  woundState: WoundState;
  woundPenalties: WoundPenalties;
}

type WoundState = 'Uninjured' | 'Light' | 'Serious' | 'Critical' | 'Mortal0' | 'Mortal1' | 'Mortal2' | 'Mortal3' | 'Mortal4' | 'Mortal5' | 'Mortal6' | 'Dead';

interface WoundPenalties {
  ref: number;
  int: number;
  cool: number;
}
```

#### Item Models
```typescript
interface Item {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'cyberware' | 'vehicle' | 'misc' | 'program';
  flavor: string;
  notes: string;
  cost: number;
  weight: number;
  equipped: boolean;
  source: string;
}

interface Weapon extends Item {
  type: 'weapon';
  weaponType: WeaponType;
  accuracy: number;
  concealability: Concealability;
  availability: Availability;
  ammoType: string;
  damage: string; // dice formula
  ap: boolean;
  shotsLeft: number;
  shots: number;
  rof: number;
  reliability: Reliability;
  range: number;
  attackType: string;
  attackSkill: string;
}

interface Armor extends Item {
  type: 'armor';
  coverage: Record<Zone, { stoppingPower: number; ablation: number }>;
  encumbrance: number;
}

interface Cyberware extends Item {
  type: 'cyberware';
  surgCode: string;
  humanityCost: string;
  humanityLoss: number;
  cyberwareType: string;
  // ... additional cyberware-specific fields
}
```

#### Session Model
```typescript
interface Session {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  
  // Current state
  characters: Character[];
  npcs: Character[];
  map: MapState;
  activeScene: Scene;
  
  // History
  chatHistory: ChatMessage[];
  sessionSummary: string;
  
  // Settings
  settings: SessionSettings;
}

interface MapState {
  backgroundImageUrl: string;
  tokens: Token[];
}

interface Scene {
  location: string;
  description: string;
  npcsPresent: string[];
  situation: string;
}

interface SessionSettings {
  ttsEnabled: boolean;
  ttsVoice: string;
  autoRollDamage: boolean;
  allowPlayerTokenMovement: boolean;
}
```

## Data Models

### Database Schema (Supabase PostgreSQL)

```sql
-- Users table (managed by Supabase Auth)
-- users.id, users.email, users.created_at

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  map_background_url TEXT,
  active_scene JSONB,
  session_summary TEXT,
  settings JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Characters table
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('character', 'npc')),
  image_url TEXT,
  role TEXT,
  age INTEGER,
  points INTEGER,
  stats JSONB NOT NULL,
  skills JSONB,
  damage INTEGER DEFAULT 0,
  hit_locations JSONB NOT NULL,
  sdp JSONB,
  eurobucks INTEGER DEFAULT 0,
  items JSONB,
  netrun_deck JSONB,
  lifepath JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tokens table
CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  x NUMERIC(5,2) NOT NULL, -- percentage 0-100
  y NUMERIC(5,2) NOT NULL,
  size INTEGER DEFAULT 50,
  controlled_by TEXT NOT NULL CHECK (controlled_by IN ('player', 'gm')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('narration', 'player', 'system', 'roll')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game data tables (weapons, armor, etc.)
CREATE TABLE weapons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  weapon_type TEXT NOT NULL,
  accuracy INTEGER,
  concealability TEXT,
  availability TEXT,
  ammo_type TEXT,
  damage TEXT,
  ap BOOLEAN DEFAULT FALSE,
  shots INTEGER,
  rof INTEGER,
  reliability TEXT,
  range INTEGER,
  attack_type TEXT,
  attack_skill TEXT,
  cost INTEGER,
  weight NUMERIC,
  source TEXT
);

-- Similar tables for armor, cyberware, gear, vehicles, skills
```

### Real-time Subscriptions

Supabase Realtime channels for each session:

```typescript
// Client subscribes to session-specific channel
const channel = supabase.channel(`session:${sessionId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'characters',
    filter: `session_id=eq.${sessionId}`
  }, handleCharacterUpdate)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tokens',
    filter: `session_id=eq.${sessionId}`
  }, handleTokenUpdate)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_messages',
    filter: `session_id=eq.${sessionId}`
  }, handleNewMessage)
  .subscribe();
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Session Persistence Round-Trip
*For any* game session with characters, map state, and chat history, saving the session to the database and then loading it should produce an equivalent session state with all data intact.
**Validates: Requirements 1.4, 11.1, 11.2, 11.3**

### Property 2: Session Isolation
*For any* two concurrent sessions, operations performed on one session (character updates, token moves, chat messages) should never affect the state of the other session.
**Validates: Requirements 1.5, 11.4**

### Property 3: Speaker-to-Character Mapping
*For any* speaker ID identified by diarization, the system should consistently map that speaker to the same character throughout a session.
**Validates: Requirements 2.3**

### Property 4: Transcription Message Format
*For any* transcribed speech, the message sent to the AI-GM should include both the transcript text and the speaker's character identity.
**Validates: Requirements 2.4**

### Property 5: Tool Execution State Changes
*For any* valid tool call executed by the AI-GM, the corresponding game state should be updated in the database and the change should be reflected in the session state.
**Validates: Requirements 3.1, 3.4**

### Property 6: Tool Parameter Validation
*For any* tool call with invalid parameters (wrong types, missing required fields, out-of-range values), the system should reject the call and return an error without modifying game state.
**Validates: Requirements 3.3**

### Property 7: Conversation Context Continuity
*For any* sequence of AI-GM interactions, each subsequent call should include all previous messages from the current session in the context.
**Validates: Requirements 3.6**

### Property 8: Keyword-Based Rule Injection
*For any* player input containing a registered keyword, the system should inject the corresponding lorebook entry into the AI-GM context.
**Validates: Requirements 4.1**

### Property 9: Rule Priority Selection
*For any* set of matching lorebook entries that exceed the token budget, the system should select entries with higher priority values first until the budget is reached.
**Validates: Requirements 4.2**

### Property 10: Token Budget Enforcement
*For any* AI-GM context assembly, the total tokens from injected lorebook entries should never exceed the configured token budget.
**Validates: Requirements 4.3**

### Property 11: Rule Lookup Tool
*For any* valid topic name passed to the lookup_rules tool, the system should return the corresponding rule file content.
**Validates: Requirements 4.4**

### Property 12: Derived Stats Calculation
*For any* character with base stats, the system should compute derived stats (BTM, run, leap, carry, lift, humanity, currentEmp) according to the Cyberpunk 2020 formulas.
**Validates: Requirements 5.1**

### Property 13: Armor SP Layering
*For any* character wearing multiple armor pieces on the same hit location, the system should calculate the total SP using the combineSP formula, which considers the difference between SP values to determine the bonus.
**Validates: Requirements 5.4**

### Property 14: Damage Application and Wound State
*For any* character taking damage, the system should update the damage total, recalculate wound state, and apply appropriate stat penalties (REF -2 for Serious, halved REF/INT/COOL for Critical, etc.).
**Validates: Requirements 5.2, 5.5, 6.3, 6.4**

### Property 15: Damage Pipeline
*For any* attack with damage roll, hit location, and target character, the system should apply the damage pipeline: apply head multiplier (×2 for head hits) → subtract location SP → subtract BTM → apply remaining damage (minimum 0).
**Validates: Requirements 6.1**

### Property 16: Armor Ablation
*For any* damage absorbed by armor (SP > 0), the system should reduce that location's SP by 1 after damage calculation.
**Validates: Requirements 6.2**

### Property 17: Hit Location Mapping
*For any* d10 roll result (1-10), the system should map it to the correct hit location according to the table: 1→Head, 2-4→Torso, 5→rArm, 6→lArm, 7-8→lLeg, 9-10→rLeg.
**Validates: Requirements 6.5**

### Property 18: Item Catalog Lookup
*For any* item name in the game catalogs (weapons, armor, cyberware, gear, vehicles), the system should be able to retrieve the item's full data including stats and cost.
**Validates: Requirements 7.1**

### Property 19: Purchase Validation
*For any* purchase attempt, if the character's eurobucks are less than the item cost, the system should reject the purchase and not modify the character's inventory or money.
**Validates: Requirements 7.3**

### Property 20: Token Ownership
*For any* token in a session, the token should have a controlledBy field that is either 'player' or 'gm', and only the appropriate user should be able to move it.
**Validates: Requirements 8.6**

### Property 21: Narration Queueing
*For any* sequence of TTS narration requests, the system should queue them in order and play them sequentially without overlap.
**Validates: Requirements 9.4**

### Property 22: Client Reconnection State Sync
*For any* client that disconnects and reconnects to a session, the system should provide the complete current game state including all characters, tokens, and recent chat history.
**Validates: Requirements 10.3**

### Property 23: Optimistic Update Rollback
*For any* optimistic update that conflicts with the server state, the system should roll back the local change and apply the authoritative server state.
**Validates: Requirements 10.5**

### Property 24: Session History Ordering
*For any* session, chat messages should be stored and retrieved in chronological order based on their timestamp.
**Validates: Requirements 11.5**

### Property 25: Exploding D10
*For any* d10 roll that results in 10, the system should roll again and add the new result to the total, repeating until a non-10 is rolled.
**Validates: Requirements 12.2**

### Property 26: Dice Formula Parsing
*For any* valid dice formula (XdY, XdY+Z, XdY-Z, 1d10x10), the system should parse it correctly and return the appropriate roll result.
**Validates: Requirements 12.3**

### Property 27: Data Schema Conversion
*For any* Foundry data object (weapon, armor, skill, etc.), converting it to the app data model and back should preserve all essential game data.
**Validates: Requirements 13.3**

### Property 28: Authentication Enforcement
*For any* request to access session data or perform actions, if the user is not authenticated, the system should reject the request with an authentication error.
**Validates: Requirements 15.1**

### Property 29: Character Ownership
*For any* character, the character should be associated with exactly one user (or marked as NPC), and only that user should be able to modify the character's data.
**Validates: Requirements 15.2, 15.3**

### Property 30: Session Creator Permissions
*For any* session, only the user who created the session should be able to perform administrative actions (delete session, remove players, modify session settings).
**Validates: Requirements 15.4**

### Property 31: Tool Call Error Logging
*For any* tool call that fails during execution, the system should log the error with details (tool name, parameters, error message) and return an error response to the AI-GM.
**Validates: Requirements 16.1**

### Property 32: Input Validation
*For any* data received from clients (character updates, token moves, chat messages), the system should validate against the expected schema and reject invalid data without processing it.
**Validates: Requirements 16.4**

## Error Handling

### Error Categories

**1. Client Errors (4xx)**
- Invalid input data (400)
- Unauthorized access (401)
- Forbidden actions (403)
- Resource not found (404)
- Validation failures (422)

**2. Server Errors (5xx)**
- Database connection failures (500)
- External API failures (502) - OpenRouter, STT, TTS
- Timeout errors (504)

**3. Real-time Errors**
- Realtime subscription or channel failures
- Broadcast message delivery failures
- State synchronization conflicts

### Error Handling Strategies

**Tool Execution Errors:**
```typescript
try {
  await toolExecutor.execute(toolCall);
} catch (error) {
  logger.error('Tool execution failed', {
    tool: toolCall.name,
    params: toolCall.parameters,
    error: error.message
  });
  
  // Notify AI-GM of failure
  return {
    success: false,
    error: `Tool ${toolCall.name} failed: ${error.message}`,
    suggestion: 'Try rephrasing the action or use a different approach'
  };
}
```

**LLM API Failures:**
```typescript
try {
  const response = await openRouterClient.chat(request);
  return response;
} catch (error) {
  if (error.status === 429) {
    // Rate limit - retry with exponential backoff
    await delay(retryDelay);
    return retryRequest(request, retries - 1);
  } else if (error.status >= 500) {
    // Server error - fallback to cached response or error message
    return {
      narration: "The GM is momentarily distracted. Please try again.",
      toolCalls: []
    };
  } else {
    throw error;
  }
}
```

**Database Errors:**
```typescript
try {
  await supabase.from('characters').update(data).eq('id', characterId);
} catch (error) {
  logger.error('Database update failed', { characterId, error });
  
  // Rollback optimistic update on client
  broadcastRollback(characterId, previousState);
  
  throw new DatabaseError('Failed to save character data');
}
```

**Realtime subscription errors:**
```typescript
channel.subscribe((status, err) => {
  if (status === 'SUBSCRIBED') return;
  logger.error('Realtime channel error', { status, err, sessionId });
  // Refetch session from Postgres, then resubscribe
});
```

**Validation Errors:**
```typescript
function validateToolCall(toolCall: ToolCall): ValidationResult {
  const schema = toolSchemas[toolCall.name];
  if (!schema) {
    return { valid: false, error: `Unknown tool: ${toolCall.name}` };
  }
  
  const result = schema.validate(toolCall.parameters);
  if (!result.valid) {
    return {
      valid: false,
      error: `Invalid parameters for ${toolCall.name}: ${result.error}`
    };
  }
  
  return { valid: true };
}
```

## Testing Strategy

### Dual Testing Approach

This system requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** verify:
- Specific examples and edge cases
- Integration points between components
- Error conditions and boundary cases
- UI component rendering (snapshot tests)

**Property-Based Tests** verify:
- Universal properties that hold for all inputs
- Game logic formulas (BTM, SP layering, wound states)
- Data transformations (serialization, schema conversion)
- State management invariants

### Property-Based Testing Configuration

**Framework:** fast-check (JavaScript/TypeScript property testing library)

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: ai-gm-multiplayer-app, Property {number}: {property_text}`
- Custom generators for game data (characters, weapons, dice rolls)

**Example Property Test:**
```typescript
import fc from 'fast-check';

// Feature: ai-gm-multiplayer-app, Property 12: Derived Stats Calculation
test('BTM calculation from body type', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 15 }), // body type
      (bt) => {
        const btm = btmFromBT(bt);
        
        // Verify BTM follows the lookup table
        if (bt <= 2) expect(btm).toBe(0);
        else if (bt <= 4) expect(btm).toBe(1);
        else if (bt <= 7) expect(btm).toBe(2);
        else if (bt <= 9) expect(btm).toBe(3);
        else if (bt === 10) expect(btm).toBe(4);
        else expect(btm).toBe(5);
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: ai-gm-multiplayer-app, Property 15: Damage Pipeline
test('damage pipeline applies correctly', () => {
  fc.assert(
    fc.property(
      fc.record({
        damage: fc.integer({ min: 1, max: 50 }),
        isHeadshot: fc.boolean(),
        sp: fc.integer({ min: 0, max: 25 }),
        btm: fc.integer({ min: 0, max: 5 }),
        currentDamage: fc.integer({ min: 0, max: 36 })
      }),
      (attack) => {
        let finalDamage = attack.damage;
        
        // Head multiplier
        if (attack.isHeadshot) finalDamage *= 2;
        
        // Subtract SP
        finalDamage -= attack.sp;
        
        // Subtract BTM
        finalDamage -= attack.btm;
        
        // Minimum 0
        finalDamage = Math.max(0, finalDamage);
        
        const result = applyDamage(attack);
        
        expect(result.damageApplied).toBe(finalDamage);
        expect(result.newDamageTotal).toBe(attack.currentDamage + finalDamage);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Custom Generators

```typescript
// Generator for valid characters
const characterArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  stats: fc.record({
    int: statBlockArbitrary,
    ref: statBlockArbitrary,
    tech: statBlockArbitrary,
    cool: statBlockArbitrary,
    attr: statBlockArbitrary,
    luck: statBlockArbitrary,
    ma: statBlockArbitrary,
    bt: statBlockArbitrary,
    emp: statBlockArbitrary
  }),
  damage: fc.integer({ min: 0, max: 40 }),
  eurobucks: fc.integer({ min: 0, max: 100000 })
});

// Generator for stat blocks
const statBlockArbitrary = fc.record({
  base: fc.integer({ min: 1, max: 10 }),
  tempMod: fc.integer({ min: -5, max: 5 })
});

// Generator for weapons
const weaponArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string(),
  weaponType: fc.constantFrom('Pistol', 'SMG', 'Shotgun', 'Rifle', 'Heavy', 'Melee'),
  damage: fc.constantFrom('1d6', '2d6', '2d6+1', '3d6', '4d6'),
  accuracy: fc.integer({ min: -2, max: 3 }),
  range: fc.integer({ min: 10, max: 800 }),
  cost: fc.integer({ min: 50, max: 5000 })
});
```

### Unit Test Coverage

**Core Game Logic:**
- `formulas.ts`: BTM calculation, strength bonus, wound state, SP layering
- `dice.ts`: Exploding d10, formula parsing, roll generation
- `lookups.ts`: Range DCs, hit location table, martial bonuses

**AI Integration:**
- `context-builder.ts`: Context assembly, token counting
- `tool-executor.ts`: Tool validation, execution, error handling
- `lorebook.ts`: Keyword matching, priority sorting, token budget

**State Management:**
- `game-store.ts`: State mutations, derived state calculation
- `actions.ts`: Apply damage, deduct money, add/remove items

**API Routes:**
- `/api/gm`: AI-GM request handling, tool execution
- `/api/voice`: STT processing, speaker diarization
- `/api/tts`: TTS generation, audio streaming

### Integration Tests

**Real-time Sync:**
- Multiple clients connecting to same session
- State updates delivered via Realtime (`postgres_changes`) to all subscribers
- Reconnection and state sync from database + resubscribe

**AI-GM Flow:**
- Player input → AI response → tool execution → state persisted → Realtime notifies clients

**Voice Processing:**
- Audio capture → STT → speaker diarization → character mapping → AI-GM

### End-to-End Tests

**Complete Game Scenarios:**
- Character creation → combat encounter → damage application → shopping → session save/load
- Multiple players in combat → turn order → damage tracking → victory conditions

### Performance Tests

**Load Testing:**
- 6 concurrent players per session
- 100 messages per minute
- Database query performance under load

**Latency Testing:**
- Realtime notification path < 500ms under normal conditions
- AI-GM response time < 5s (excluding LLM inference)
- Database operations < 200ms

## Implementation Notes

### Critical Path

1. **Game Logic Foundation** - Implement all formulas, dice rolling, and lookups first. These are pure functions with no dependencies.

2. **Data Models & Database** - Set up Supabase schema, create TypeScript interfaces, implement data access layer.

3. **Character Sheet Component** - Build the UI for displaying and editing characters. This validates the game logic integration.

4. **Supabase Realtime** - Subscribe to `postgres_changes` (+ optional broadcast) and wire to Zustand.

5. **AI-GM Integration** - Build context assembly, tool executor, and OpenRouter API integration (Route Handlers).

6. **Voice Processing** - Integrate STT with speaker diarization and TTS for narration.

7. **Map & Tokens** - Implement visual map with draggable tokens.

8. **Polish & Testing** - Comprehensive testing, error handling, performance optimization.

### Key Design Decisions

**Why Web App over Desktop:**
- Easier deployment and updates (no installation required)
- Better for multiplayer (no NAT traversal issues)
- Cross-platform by default
- Simpler authentication and session management

**Why Supabase over Firebase:**
- PostgreSQL provides better relational data modeling
- Built-in real-time subscriptions
- Row-level security for authorization
- Better TypeScript support

**Why OpenRouter with GLM 4.7:**
- Single API for multiple LLM providers
- GLM 4.7 offers good performance for tool calling
- Fallback options if primary model is unavailable

**Why Supabase Realtime instead of a custom Node WebSocket server:**
- Aligns with Postgres as source of truth and RLS; fewer moving parts to deploy
- `postgres_changes` for durable state; `broadcast` for ephemeral UI when needed
- Custom Socket.io/WebSocket service remains an optional future path if requirements outgrow Realtime

**Why fast-check for Property Testing:**
- Mature JavaScript property testing library
- Good TypeScript support
- Flexible custom generators
- Shrinking support for minimal failing examples

### Security Considerations

**Authentication:**
- Supabase Auth with JWT tokens
- Row-level security policies on all tables
- API routes validate JWT on every request

**Authorization:**
- Characters belong to users (foreign key)
- Only character owner can modify character data
- Session creator has admin privileges
- Tool calls validated before execution

**Input Validation:**
- All client inputs validated against schemas
- SQL injection prevented by Supabase parameterized queries
- XSS prevented by React's automatic escaping
- Rate limiting on API routes

**API Keys:**
- OpenRouter, STT, TTS keys stored in environment variables
- Never exposed to client
- Rotated regularly

### Scalability Considerations

**Database:**
- Indexes on frequently queried fields (session_id, user_id)
- Pagination for chat history
- Archiving old sessions

**Realtime:**
- Prefer DB writes for authoritative updates; avoid duplicating state in broadcast-only messages
- Monitor Supabase Realtime quotas and connection counts

**Caching:**
- Static game data (weapons, armor) cached in memory
- CDN for images and audio files
- Redis for session state (optional)

**Monitoring:**
- Error tracking (Sentry)
- Performance monitoring (hosting provider or OpenTelemetry)
- Database query performance (Supabase Dashboard)
