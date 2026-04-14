# Data Import Scripts

This directory contains scripts for extracting and importing game data from Foundry VTT into the application.

## Scripts

### 1. extract-foundry-data.ts

Extracts game data from Foundry VTT compendium files (`.db` files in NDJSON format) and converts them to JSON arrays.

**Usage:**
```bash
npx tsx scripts/extract-foundry-data.ts
```

**Output:**
- Creates JSON files in `app/lib/data/`:
  - `weapons.json` - All weapons (pistols, rifles, shotguns, SMGs, heavy, melee, cyberweapons)
  - `armor.json` - All armor pieces
  - `cyberware.json` - All cyberware (bioware, chipware, cyberaudio, cyberlimbs, etc.)
  - `skills.json` - All skills (default and role-specific)
  - `gear.json` - Miscellaneous items (communication, electronics, tools, etc.)
  - `vehicles.json` - All vehicles
  - `programs.json` - Netrunning programs

### 2. import-to-supabase.ts

Imports the extracted JSON data into Supabase database tables.

**Prerequisites:**
1. Set up your Supabase project
2. Run the database schema from `app/lib/database/schema.sql`
3. Configure environment variables in `app/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

**Usage:**
```bash
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

## Data Flow

```
Foundry .db files (NDJSON)
    ↓
extract-foundry-data.ts
    ↓
JSON files (app/lib/data/)
    ↓
import-to-supabase.ts
    ↓
Supabase database tables
```

## Data Transformation

The import script transforms Foundry's data structure to match our application schema:

- **Weapons**: Extracts weapon stats, damage, accuracy, range, etc.
- **Armor**: Extracts coverage zones and stopping power
- **Cyberware**: Extracts humanity cost, surgery code, type
- **Skills**: Extracts linked stat and category
- **Gear**: Extracts cost and weight
- **Vehicles**: Extracts speed, handling, armor, SDP
- **Programs**: Extracts strength, MU cost, type

## Validation

The import script performs validation:
- Filters out items with empty names
- Converts string numbers to proper numeric types
- Provides default values for missing fields
- Reports any import errors

## Re-running Imports

You can safely re-run the import script. It will:
1. Clear all existing data from the target tables
2. Import fresh data from the JSON files

This is useful when:
- Updating game data
- Fixing data issues
- Resetting the database

## Troubleshooting

**"Missing Supabase credentials"**
- Make sure `app/.env.local` exists and contains the required variables
- Copy from `app/.env.local.example` if needed

**"Failed to connect to Supabase"**
- Verify your Supabase URL and service role key are correct
- Make sure the database schema has been set up
- Check your network connection

**"Failed to insert batch"**
- Check the error message for details
- Verify the database schema matches the expected structure
- Some items may have invalid data that needs manual correction
