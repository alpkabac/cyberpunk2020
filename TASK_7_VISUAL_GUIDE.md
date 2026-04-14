# Task 7 Visual Guide - Interactive Features

## Overview
This guide shows what each new interactive feature looks like and how to use it.

## 🎯 Combat Tab

### Before
- Static display of armor and weapons
- No way to apply damage
- No armor equipping

### After
```
┌─────────────────────────────────────┐
│ [Roll Initiative] [Stun/Death Save] │
│ [Apply Damage] ← NEW!               │
├─────────────────────────────────────┤
│ ARMOR                               │
│ ┌─────┬─────┐                       │
│ │Head │Torso│ SP: 20 / 18          │
│ │SP:4 │SP:18│                       │
│ └─────┴─────┘                       │
│                                     │
│ Kevlar Vest                         │
│ [Equip Head] [Equip Torso] ← NEW!  │
├─────────────────────────────────────┤
│ WEAPONS                             │
│ [Heavy Pistol] ← Click to attack   │
│ [Assault Rifle]                     │
└─────────────────────────────────────┘
```

### Apply Damage Dialog
```
┌─────────────────────────────────────┐
│ APPLY DAMAGE                    [×] │
├─────────────────────────────────────┤
│ Johnny Silverhand                   │
│ Current Damage: 5 / BTM: -2         │
├─────────────────────────────────────┤
│ Damage Amount                       │
│ ┌─────────────────────────────────┐ │
│ │          15                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Quick: [5] [10] [15] [20]          │
├─────────────────────────────────────┤
│ [Apply to Specific Location]       │
│ [Apply General Damage]              │
└─────────────────────────────────────┘
```

### Target Selector
```
┌─────────────────────────────────────┐
│ SELECT TARGET LOCATION          [×] │
├─────────────────────────────────────┤
│ [Head              Roll: 1-4    ]   │
│ [Torso             Roll: 5-8    ]   │
│ [Right Arm         Roll: 9      ]   │
│ [Left Arm          Roll: 10     ]   │
│ [Right Leg         Roll: 11-13  ]   │
│ [Left Leg          Roll: 14-16  ]   │
└─────────────────────────────────────┘
```

## 🎒 Gear Tab

### Before
- Static item list
- No way to add items
- "Drag items here" placeholder

### After
```
┌─────────────────────────────────────┐
│ Eurobucks: €5,000  Weight: 15.2 kg │
├─────────────────────────────────────┤
│ [+ Add Items] ← NEW!                │
├─────────────────────────────────────┤
│ ┌─────────────┬─────────────┐       │
│ │ Medkit   [×]│ Rope     [×]│       │
│ │ gear        │ gear        │       │
│ └─────────────┴─────────────┘       │
└─────────────────────────────────────┘
```

### Item Browser
```
┌─────────────────────────────────────────────────┐
│ ITEM BROWSER                              [×]   │
├─────────────────────────────────────────────────┤
│ Search: [medkit________________]                │
│ [all][weapon][armor][cyberware][gear][program]  │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ [img] Trauma Team Medkit                    │ │
│ │       gear                    €500    2.0kg │ │
│ │       Professional medical supplies...      │ │
│ │       [Add to Inventory]                    │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ [img] Basic Medkit                          │ │
│ │       gear                    €50     0.5kg │ │
│ │       Basic first aid kit...                │ │
│ │       [Add to Inventory]                    │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## 🤖 Cyberware Tab

### Before
- Static list of cyberware
- No install/uninstall
- No way to add new cyberware

### After
```
┌─────────────────────────────────────┐
│ Total EB: €15,000  Humanity Loss: 8 │
├─────────────────────────────────────┤
│ INSTALLED CYBERWARE                 │
│ [+ Add Cyberware] ← NEW!            │
├─────────────────────────────────────┤
│ ┌─────────────────┬───────────────┐ │
│ │ Cyberoptic      │ Neural Link   │ │
│ │ HL: 2  [ACTIVE] │ HL: 3 [ACTIVE]│ │
│ │ [Uninstall] [×] │ [Uninstall][×]│ │
│ └─────────────────┴───────────────┘ │
│ ┌─────────────────┬───────────────┐ │
│ │ Smartgun Link   │               │ │
│ │ HL: 3           │               │ │
│ │ [Install]   [×] │               │ │
│ └─────────────────┴───────────────┘ │
└─────────────────────────────────────┘
```

## 🌐 Netrun Tab

### Before
- Static program list
- No load/unload
- No way to add programs

### After
```
┌─────────────────────────────────────┐
│ Deck: Zetatech 20  Interface: 8     │
│ RAM: 12 / 40                        │
├─────────────────────────────────────┤
│ PROGRAMS                            │
│ [+ Add Programs] ← NEW!             │
├─────────────────────────────────────┤
│ ┌─────────────────┬───────────────┐ │
│ │ Hammer          │ Shield        │ │
│ │ Attack • MU: 5  │ Defense • 3   │ │
│ │ [LOADED]        │ [LOADED]      │ │
│ │ [Unload]    [×] │ [Unload]  [×] │ │
│ └─────────────────┴───────────────┘ │
│ ┌─────────────────┬───────────────┐ │
│ │ Virus           │               │ │
│ │ Attack • MU: 8  │               │ │
│ │ [Load]      [×] │               │ │
│ └─────────────────┴───────────────┘ │
└─────────────────────────────────────┘
```

## 🎲 Skills Tab (Already Working)

```
┌─────────────────────────────────────┐
│ Search: [combat___] [Sort: Category]│
├─────────────────────────────────────┤
│ COMBAT                              │
│ ┌─────────────────────────────────┐ │
│ │ Handgun                      12 │ │
│ │ REF: 5 + 7 = 12                 │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Melee                         8 │ │
│ │ REF: 5 + 3 = 8                  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ TECHNICAL                           │
│ ┌─────────────────────────────────┐ │
│ │ Electronics                  10 │ │
│ │ TECH: 7 + 3 = 10                │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 🎮 User Flows

### Flow 1: Adding Items
1. Open Gear/Cyberware/Netrun tab
2. Click "Browse Items" or "+ Add Items"
3. Search for item (e.g., "medkit")
4. Filter by type if needed
5. Click "Add to Inventory"
6. Item appears in character inventory

### Flow 2: Applying Damage
1. Open Combat tab
2. Click "Apply Damage" button
3. Enter damage amount (or use quick buttons)
4. Choose:
   - "Apply to Specific Location" → Select body part
   - "Apply General Damage" → Immediate application
5. Damage applied, armor SP reduced if location-specific

### Flow 3: Installing Cyberware
1. Open Cyberware tab
2. Click "+ Add Cyberware"
3. Search and add cyberware to inventory
4. Click "Install" button on cyberware
5. Humanity loss calculated and applied
6. Cyberware marked as ACTIVE with green border

### Flow 4: Loading Programs
1. Open Netrun tab
2. Click "+ Add Programs"
3. Search and add programs to inventory
4. Click "Load" button on program
5. RAM usage updated
6. Program marked as LOADED

### Flow 5: Equipping Armor
1. Open Combat tab
2. Scroll to armor section
3. Click "Equip [Location]" button on armor piece
4. SP applied to that hit location
5. Hit location display updates with new SP

## 🎨 Visual Indicators

### Status Colors
- **Green border/text**: Active/Installed/Loaded
- **Red button**: Damage/Uninstall/Remove
- **Blue**: Netrunning/Programs
- **Orange**: Unload/Deactivate
- **Gray**: Disabled/Can't afford

### Interactive Elements
- **Hover effects**: Gray background on buttons
- **Click feedback**: All buttons have visual feedback
- **Disabled state**: Grayed out when not available
- **Loading state**: "Searching..." text during searches

## 📱 Responsive Design

All components use:
- Grid layouts for item lists (2 columns)
- Flexbox for button groups
- Border-based design (Cyberpunk aesthetic)
- Clear typography with bold labels
- Consistent spacing (gap-2, gap-4)

## ♿ Accessibility

- All buttons have clear labels
- Hover states for better visibility
- Keyboard navigation support
- Clear visual hierarchy
- High contrast text

## 🔧 Technical Notes

### Component Reusability
- ItemBrowser is used by Gear, Cyberware, and Netrun tabs
- TargetSelector is used by DamageApplicator
- All components use the same Zustand store

### Performance
- Search debouncing (300ms)
- Cached game data (5 minute TTL)
- Optimized re-renders with Zustand selectors

### Error Handling
- Affordability checks before purchase
- Validation before damage application
- Graceful handling of missing data
- Clear error messages to user
