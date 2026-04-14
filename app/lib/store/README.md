# Game Store

Zustand-based state management for the Cyberpunk 2020 AI-GM application.

## Overview

The game store manages all client-side state including:
- **Characters**: Player characters with stats, skills, inventory, and wound tracking
- **NPCs**: Non-player characters controlled by the AI-GM
- **Session**: Session metadata, settings, and active scene
- **Map**: Map background and token positions
- **Chat**: Chat message history and loading state
- **UI**: UI state like selected character, dice roller, voice recording

## Usage

### Basic Usage

```typescript
import { useGameStore } from '@/lib/store';

function MyComponent() {
  // Access state
  const characters = useGameStore(state => state.characters.byId);
  
  // Call actions
  const addCharacter = useGameStore(state => state.addCharacter);
  const applyDamage = useGameStore(state => state.applyDamage);
  
  // Use selectors
  const allCharacters = useGameStore(selectAllCharacters);
  
  return (
    <div>
      {/* Your component */}
    </div>
  );
}
```

### Selectors

The store provides several selectors for derived data:

```typescript
import { 
  useGameStore,
  selectAllCharacters,
  selectCharacterById,
  selectSelectedCharacter,
  selectCharacterDerivedStats,
  selectCanAfford
} from '@/lib/store';

// Get all characters as an array
const characters = useGameStore(selectAllCharacters);

// Get a specific character
const character = useGameStore(state => selectCharacterById(state, 'char-id'));

// Get currently selected character
const selected = useGameStore(selectSelectedCharacter);

// Get derived stats for a character
const derivedStats = useGameStore(state => 
  selectCharacterDerivedStats(state, 'char-id')
);

// Check if character can afford an item
const canBuy = useGameStore(state => 
  selectCanAfford(state, 'char-id', 500)
);
```

## State Structure

### Characters Slice
```typescript
{
  byId: Record<string, Character>,
  allIds: string[]
}
```

Characters are stored in a normalized structure for efficient lookups and updates.

### Session Slice
```typescript
{
  id: string | null,
  name: string,
  createdBy: string | null,
  createdAt: number | null,
  activeScene: Scene | null,
  settings: SessionSettings,
  sessionSummary: string
}
```

### Map Slice
```typescript
{
  backgroundImageUrl: string,
  tokens: Token[]
}
```

### Chat Slice
```typescript
{
  messages: ChatMessage[],
  isLoading: boolean
}
```

### UI Slice
```typescript
{
  selectedCharacterId: string | null,
  selectedTokenId: string | null,
  isDiceRollerOpen: boolean,
  diceFormula: string | null,
  isChatInputFocused: boolean,
  isVoiceRecording: boolean
}
```

## Actions

### Character Actions

- `addCharacter(character)` - Add a new character
- `updateCharacter(characterId, updates)` - Update character fields
- `removeCharacter(characterId)` - Remove a character
- `applyDamage(characterId, amount, location?)` - Apply damage and update wound state
- `deductMoney(characterId, amount)` - Subtract eurobucks
- `addItem(characterId, item)` - Add item to inventory
- `removeItem(characterId, itemId)` - Remove item from inventory
- `updateCharacterField(characterId, path, value)` - Update nested field

### Map Actions

- `setMapBackground(url)` - Set map background image
- `addToken(token)` - Add a token to the map
- `moveToken(tokenId, x, y)` - Move a token
- `removeToken(tokenId)` - Remove a token

### Chat Actions

- `addChatMessage(message)` - Add a message to chat history
- `setChatLoading(isLoading)` - Set chat loading state
- `clearChatHistory()` - Clear all messages

### Session Actions

- `setSession(session)` - Set session data
- `updateSessionSettings(settings)` - Update session settings
- `setActiveScene(scene)` - Set the active scene

### UI Actions

- `selectCharacter(characterId)` - Select a character
- `selectToken(tokenId)` - Select a token
- `openDiceRoller(formula)` - Open dice roller with formula
- `closeDiceRoller()` - Close dice roller
- `setVoiceRecording(isRecording)` - Set voice recording state

## Automatic Derived Stats

The store automatically calculates derived stats whenever a character is added or updated:

- **BTM** (Body Type Modifier) - Damage reduction from body type
- **Run/Leap** - Movement distances
- **Carry/Lift** - Carrying capacity
- **Humanity/Current EMP** - Humanity and empathy after cyberware
- **Wound State** - Current wound level (Uninjured, Light, Serious, Critical, Mortal, Dead)
- **Wound Penalties** - Stat penalties from wounds

These are calculated using the formulas from `lib/game-logic/formulas.ts`.

## Testing

The store includes comprehensive unit tests covering:
- Character management (add, update, remove)
- Damage application and wound state
- Money management
- Item management
- Token movement
- Chat messages
- Field updates

Run tests with:
```bash
npm test -- game-store.test.ts
```

## Implementation Notes

### Normalized State

Characters and NPCs are stored in a normalized structure (`byId` + `allIds`) for:
- O(1) lookups by ID
- Efficient updates (no array iteration)
- Easy relationship management

### Immutability

All state updates create new objects rather than mutating existing ones. This ensures:
- Predictable state changes
- Easy debugging with time-travel
- Proper React re-renders

### Derived Stats Recalculation

Derived stats are recalculated automatically when:
- A character is added
- A character is updated
- Damage is applied
- Items are added/removed (cyberware affects humanity)
- Character fields are updated

This ensures derived stats are always in sync with base stats.
