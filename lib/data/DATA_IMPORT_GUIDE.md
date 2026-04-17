# Game Data Import Guide

This guide explains how to extract game data from Foundry VTT and import it into your Supabase database.

## Overview

The data import process consists of three steps:

1. **Extract** - Convert Foundry .db files to JSON
2. **Import** - Load JSON data into Supabase
3. **Access** - Query data through the data access layer

## Prerequisites

Before importing data, ensure you have:

1. ✅ Foundry VTT compendium files in `packs/` directory
2. ✅ Supabase project created
3. ✅ Database schema applied (run `app/lib/database/schema.sql`)
4. ✅ Environment variables configured in `app/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Step 1: Extract Foundry Data

Run the extraction script to convert Foundry .db files to JSON:

```bash
cd app
npx tsx scripts/extract-foundry-data.ts
```

**What it does:**
- Reads all .db files from `packs/` directory
- Parses NDJSON format (newline-delimited JSON)
- Combines related packs (e.g., all weapon types)
- Outputs JSON files to `app/lib/data/`

**Output files:**
- `weapons.json` - 818 items (pistols, rifles, shotguns, SMGs, heavy, melee, cyberweapons)
- `armor.json` - 16 items
- `cyberware.json` - 324 items (bioware, chipware, cyberaudio, cyberlimbs, etc.)
- `skills.json` - 190 items (default and role-specific)
- `gear.json` - 150 items (communication, electronics, tools, etc.)
- `vehicles.json` - 17 items
- `programs.json` - 60 items (netrunning programs)

## Step 2: Import to Supabase

Run the import script to load data into your Supabase database:

```bash
cd app
npx tsx scripts/import-to-supabase.ts
```

**What it does:**
- Connects to your Supabase database
- Clears existing data from game data tables
- Transforms Foundry data format to application schema
- Imports data in batches (100 items per batch)
- Validates data integrity during import

**Tables populated:**
- `weapons` - Weapon reference data
- `armor` - Armor reference data
- `cyberware` - Cyberware reference data
- `gear` - Miscellaneous items
- `vehicles` - Vehicle reference data
- `skills_reference` - Skill reference data
- `programs` - Netrunning program reference data

**Expected output:**
```
Supabase Data Import
====================
✓ Connected to Supabase successfully

Importing weapons...
  📄 Loaded 818 items from weapons.json
  ✓ Transformed 818 valid items
  🗑️  Cleared existing data from weapons
  ✓ Imported batch 1 (100 items)
  ✓ Imported batch 2 (100 items)
  ...
  ✅ Successfully imported 818/818 items to weapons

[Similar output for other categories]

✅ Import complete!
```

## Step 3: Use the Data Access Layer

Once data is imported, you can query it using the data access layer:

```typescript
import {
  getAllWeapons,
  getWeaponByName,
  searchWeapons,
  getAllArmor,
  searchAllItems,
} from '@/lib/data';

// Get all weapons (cached)
const weapons = await getAllWeapons();

// Find specific weapon
const pistol = await getWeaponByName('Militech Arms Avenger');

// Search across all items
const results = await searchAllItems('cyber');
```

### Available Functions

**Weapons:**
- `getAllWeapons()` - Get all weapons (cached)
- `getWeaponByName(name)` - Find weapon by exact name
- `getWeaponsByType(type)` - Filter by weapon type
- `searchWeapons(query)` - Search by partial name

**Armor:**
- `getAllArmor()` - Get all armor (cached)
- `getArmorByName(name)` - Find armor by exact name
- `searchArmor(query)` - Search by partial name

**Cyberware:**
- `getAllCyberware()` - Get all cyberware (cached)
- `getCyberwareByName(name)` - Find cyberware by exact name
- `getCyberwareByType(type)` - Filter by cyberware type
- `searchCyberware(query)` - Search by partial name

**Gear:**
- `getAllGear()` - Get all gear (cached)
- `getGearByName(name)` - Find gear by exact name
- `searchGear(query)` - Search by partial name

**Vehicles:**
- `getAllVehicles()` - Get all vehicles (cached)
- `getVehicleByName(name)` - Find vehicle by exact name
- `getVehiclesByType(type)` - Filter by vehicle type
- `searchVehicles(query)` - Search by partial name

**Skills:**
- `getAllSkills()` - Get all skills (cached)
- `getSkillByName(name)` - Find skill by exact name
- `getSkillsByCategory(category)` - Filter by category

**Programs:**
- `getAllPrograms()` - Get all programs (cached)
- `getProgramByName(name)` - Find program by exact name
- `getProgramsByType(type)` - Filter by program type
- `searchPrograms(query)` - Search by partial name

**Generic:**
- `searchAllItems(query)` - Search across all item types
- `clearCache()` - Clear all cached data

### Caching

The data access layer implements in-memory caching:

- **Cache TTL:** 5 minutes
- **Automatic:** First query fetches from database, subsequent queries use cache
- **Manual clear:** Call `clearCache()` to force refresh

This provides excellent performance since game data is static and rarely changes.

## Data Transformation

The import script transforms Foundry's data structure to match our application schema:

### Weapons
```typescript
{
  name: "Militech Arms Avenger",
  weapon_type: "Pistol",
  damage: "2D6+1",
  accuracy: 0,
  range: 50,
  cost: 250,
  // ... other fields
}
```

### Armor
```typescript
{
  name: "Light Armor Jacket",
  coverage: {
    "Torso": { "stoppingPower": 14, "ablation": 0 },
    "rArm": { "stoppingPower": 14, "ablation": 0 },
    // ... other zones
  },
  cost: 50,
  // ... other fields
}
```

### Cyberware
```typescript
{
  name: "Cyberoptic",
  cyberware_type: "Cyberoptic",
  humanity_cost: "2d6",
  humanity_loss: 7,
  cost: 500,
  // ... other fields
}
```

## Troubleshooting

### "Missing Supabase credentials"
- Ensure `app/.env.local` exists
- Copy from `app/.env.local.example` if needed
- Add your Supabase URL and keys

### "Failed to connect to Supabase"
- Verify your Supabase URL and service role key are correct
- Ensure the database schema has been set up
- Check your network connection

### "Failed to insert batch"
- Check the error message for details
- Verify the database schema matches the expected structure
- Some items may have invalid data that needs manual correction

### Empty results when querying
- Make sure you ran the import script successfully
- Check that data exists in Supabase dashboard
- Verify environment variables are set correctly

## Re-running Imports

You can safely re-run the import script. It will:
1. Clear all existing data from the target tables
2. Import fresh data from the JSON files

This is useful when:
- Updating game data
- Fixing data issues
- Resetting the database

## Next Steps

After importing data, you can:

1. ✅ Use the data access layer in your application
2. ✅ Build the AI-GM tool executor to reference items
3. ✅ Create the shopping system
4. ✅ Implement character inventory management

## Files Created

- `app/scripts/extract-foundry-data.ts` - Extraction script
- `app/scripts/import-to-supabase.ts` - Import script
- `app/scripts/README.md` - Scripts documentation
- `app/lib/data/game-data.ts` - Data access layer
- `app/lib/data/game-data.test.ts` - Tests
- `app/lib/data/index.ts` - Exports
- `app/lib/data/*.json` - Extracted game data (7 files)

## Summary

✅ **Task 5.1:** Extract Foundry compendium data to JSON - **COMPLETE**
✅ **Task 5.2:** Create data import scripts - **COMPLETE**
✅ **Task 5.4:** Create data access layer - **COMPLETE**

All game data extraction and import functionality is now implemented and ready to use!
