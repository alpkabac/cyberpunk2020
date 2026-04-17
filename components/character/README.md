# Character Sheet Component

A comprehensive character sheet component for the Cyberpunk 2020 AI-GM application.

## Features

### 1. Stat Display (Task 7.1)
- Displays all 9 stats (INT, REF, TECH, COOL, ATTR, LUCK, MA, BT, EMP)
- Shows base value, temp modifiers, and computed totals
- Displays derived stats: BTM, run, leap, carry, lift, humanity, currentEmp
- Shows wound state and current damage with color coding

### 2. Skills List (Task 7.2)
- Displays all skills grouped by category
- Shows skill value, linked stat, and total modifier
- Roll button for each skill that opens the dice roller
- Calculates total skill check value (skill + stat)

### 3. Wound Tracker & Hit Locations (Task 7.3)
- Color-coded wound state display (Uninjured → Dead)
- Shows wound penalties for REF, INT, COOL
- Displays all 6 hit locations (Head, Torso, Arms, Legs)
- Shows current SP and ablation for each location
- Visual SP bar with color coding

### 4. Inventory & Equipment (Task 7.4)
- Displays eurobucks balance
- Shows all items grouped by type (weapons, armor, cyberware, etc.)
- Equip/unequip functionality for weapons, armor, and cyberware
- Shows item-specific details (damage, accuracy, humanity loss, etc.)
- Visual indication of equipped items

### 5. Stat Editing (Task 7.5)
- Editable base stat values (when editable=true)
- Editable temp modifiers
- Automatic recalculation of derived stats on change
- Input validation (1-15 for base stats, -10 to +10 for temp mods)

## Usage

```tsx
import { CharacterSheet } from '@/components/character';

// Display character sheet (read-only)
<CharacterSheet characterId="char-123" />

// Display character sheet (editable)
<CharacterSheet characterId="char-123" editable={true} />
```

## Props

- `characterId` (string, required): The ID of the character to display
- `editable` (boolean, optional): Whether stats can be edited. Default: false

## Demo

Visit `/character-demo` to see the component in action with a sample character.

## Styling

The component uses a cyberpunk-themed design with:
- Cyan/teal accent colors
- Dark gray backgrounds
- Neon-style borders and shadows
- Grid patterns and retro-futuristic aesthetic

## Dependencies

- Zustand store for state management
- Game logic formulas for derived stat calculations
- TypeScript types from `@/lib/types`
