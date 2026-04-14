# Character Sheet Interactive Features

This document describes all the interactive features implemented in Task 7 of the character sheet.

## Overview

The character sheet now has full player agency with interactive controls for all major gameplay features. Both players and the AI-GM can perform actions through the UI.

## New Components

### 1. ItemBrowser
**Location:** `app/components/character/ItemBrowser.tsx`

**Features:**
- Search across all item types (weapons, armor, cyberware, gear, programs)
- Filter by item type
- Real-time search with debouncing
- Shows item details (cost, weight, description)
- Affordability checking (grays out items player can't afford)
- One-click add to inventory

**Usage:**
- Accessible from Gear, Cyberware, and Netrun tabs
- Click "Browse Items" or "+ Add Items" buttons
- Search for items by name
- Filter by type using category buttons
- Click "Add to Inventory" to add items

### 2. TargetSelector
**Location:** `app/components/character/TargetSelector.tsx`

**Features:**
- Visual body location picker
- Shows hit location roll ranges (e.g., Head: 1-4)
- Hover effects for better UX
- Clear labeling of all body zones

**Usage:**
- Opens when applying damage to specific location
- Click on body part to select target
- Used for armor ablation and location-specific damage

### 3. DamageApplicator
**Location:** `app/components/character/DamageApplicator.tsx`

**Features:**
- Manual damage input
- Quick damage buttons (5, 10, 15, 20)
- Two damage modes:
  - **Specific Location:** Reduces armor SP at target location
  - **General Damage:** Adds to total damage without armor ablation
- Shows current damage and BTM
- Integrates with TargetSelector

**Usage:**
- Click "Apply Damage" button in Combat tab
- Enter damage amount or use quick buttons
- Choose specific location or general damage
- Damage is immediately applied to character

## Enhanced Tabs

### Combat Tab
**New Features:**
- ✅ Apply Damage button (opens DamageApplicator)
- ✅ Armor equipping by location
- ✅ Shows armor coverage and SP per location
- ✅ Armor ablation tracking
- ✅ Weapon attack rolls (click weapon to roll)

**How to Use:**
- **Apply Damage:** Click red "Apply Damage" button
- **Equip Armor:** Click "Equip [Location]" buttons on armor items
- **Attack:** Click weapon name to roll attack

### Gear Tab
**New Features:**
- ✅ Item browser integration
- ✅ Add/remove items
- ✅ Weight tracking
- ✅ Eurobucks management
- ✅ Empty state with browse button

**How to Use:**
- **Add Items:** Click "Browse Items" or "+ Add Items"
- **Remove Items:** Click × button on item
- **Edit Money:** Click eurobucks field (if editable)

### Cyberware Tab
**New Features:**
- ✅ Install/uninstall cyberware
- ✅ Humanity loss tracking
- ✅ Active/inactive status
- ✅ Item browser for cyberware
- ✅ Visual indicators for installed cyberware

**How to Use:**
- **Add Cyberware:** Click "Browse Cyberware" or "+ Add Cyberware"
- **Install:** Click "Install" button (turns green, adds humanity loss)
- **Uninstall:** Click "Uninstall" button (removes humanity loss)
- **Remove:** Click × button to delete from inventory

### Netrun Tab
**New Features:**
- ✅ Program management
- ✅ Load/unload programs
- ✅ RAM tracking (MU cost per program)
- ✅ Item browser for programs
- ✅ Loaded/unloaded status

**How to Use:**
- **Add Programs:** Click "Browse Programs" or "+ Add Programs"
- **Load Program:** Click "Load" button (marks as loaded)
- **Unload Program:** Click "Unload" button
- **Remove:** Click × button to delete

### Skills Tab
**Existing Features (Already Implemented):**
- ✅ Click skill to roll (1d10 + skill + stat)
- ✅ Search skills
- ✅ Sort by name, category, or value
- ✅ Shows linked stat and total modifier

## Store Functions Used

All interactive features use the Zustand game store:

```typescript
// Item management
addItem(characterId, item)
removeItem(characterId, itemId)

// Damage application
applyDamage(characterId, amount, location?)

// Money management
deductMoney(characterId, amount)

// Field updates
updateCharacterField(characterId, path, value)

// UI state
openDiceRoller(formula)
```

## Data Access

Items are fetched from Supabase using the game-data layer:

```typescript
// Search functions
searchAllItems(query)
searchWeapons(query)
searchArmor(query)
searchCyberware(query)
searchGear(query)
searchPrograms(query)

// Get all functions
getAllWeapons()
getAllArmor()
getAllCyberware()
getAllGear()
getAllPrograms()
```

## Player Agency Features

All major actions can be performed by both players and AI-GM:

| Feature | Player UI | AI-GM Tool |
|---------|-----------|------------|
| Add Items | ✅ ItemBrowser | ✅ add_item |
| Remove Items | ✅ Remove button | ✅ remove_item |
| Apply Damage | ✅ DamageApplicator | ✅ apply_damage |
| Equip Armor | ✅ Equip buttons | ✅ equip_armor |
| Install Cyberware | ✅ Install button | ✅ install_cyberware |
| Load Programs | ✅ Load button | ✅ load_program |
| Roll Skills | ✅ Click skill | ✅ roll_skill |
| Roll Attacks | ✅ Click weapon | ✅ roll_attack |

## Editable Mode

All interactive features respect the `editable` prop:

- **Editable = true:** Full controls (add, remove, modify)
- **Editable = false:** Read-only display

This allows:
- Players to edit their own characters
- GM to view player characters without editing
- Players to view NPCs without editing

## Next Steps

Task 7 is now complete! The character sheet has:
- ✅ Full item management
- ✅ Combat damage application
- ✅ Armor equipping
- ✅ Cyberware installation
- ✅ Program management
- ✅ Skill rolling
- ✅ Target selection

Ready to move on to:
- **Task 1-3:** Supabase setup and authentication
- **Task 4:** Real-time multiplayer sync
- **Task 8:** AI-GM integration
