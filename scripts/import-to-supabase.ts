/**
 * Script to import extracted Foundry data into Supabase
 * 
 * This script reads the JSON files created by extract-foundry-data.ts
 * and imports them into the corresponding Supabase tables.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface FoundryItem {
  _id?: string;
  name: string;
  type?: string;
  img?: string;
  data?: any;
  system?: any;
}

const FOUNDRY_META_KEYS = new Set([
  '_id',
  'id',
  'name',
  'type',
  'img',
  'effects',
  'folder',
  'sort',
  'permission',
  'flags',
  'data',
  'system',
]);

/**
 * Foundry items use `data` (or v10+ `system`). Some exports omit those and put fields at the top level.
 */
function getFoundryItemData(item: Record<string, unknown>): Record<string, any> {
  const nested = item.data ?? item.system;
  if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, any>;
  }
  const rest: Record<string, any> = {};
  for (const [k, v] of Object.entries(item)) {
    if (!FOUNDRY_META_KEYS.has(k)) rest[k] = v;
  }
  return rest;
}

function parseIntField(v: unknown, fallback = 0): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseFloatField(v: unknown, fallback = 0): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? fallback : n;
}

function resolveSource(item: Record<string, unknown>, data: Record<string, any>): string {
  return String(data.source ?? item.source ?? 'Cyberpunk 2020');
}

/**
 * Transform Foundry weapon data to our schema
 */
function transformWeapon(item: FoundryItem): any {
  const raw = item as unknown as Record<string, unknown>;
  const data = getFoundryItemData(raw);

  return {
    name: String(item.name ?? data.name ?? '').trim() || 'Unknown',
    weapon_type: data.weaponType || 'Unknown',
    accuracy: parseIntField(data.accuracy),
    concealability: data.concealability || '',
    availability: data.availability || '',
    ammo_type: data.ammoType || '',
    damage: data.damage || '1d6',
    ap: Boolean(data.ap),
    shots: parseIntField(data.shots),
    rof: parseIntField(data.rof, 1),
    reliability: data.reliability || 'ST',
    range: parseIntField(data.range),
    attack_type: data.attackType || '',
    attack_skill: data.attackSkill || '',
    cost: parseIntField(data.cost),
    weight: parseFloatField(data.weight),
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: resolveSource(raw, data),
  };
}

/**
 * Transform Foundry armor data to our schema
 */
function transformArmor(item: FoundryItem): any {
  const raw = item as unknown as Record<string, unknown>;
  const data = getFoundryItemData(raw);
  const coverage = data.coverage && typeof data.coverage === 'object' ? data.coverage : {};

  return {
    name: String(item.name ?? data.name ?? '').trim() || 'Unknown',
    coverage,
    encumbrance: parseIntField(data.encumbrance),
    cost: parseIntField(data.cost),
    weight: parseFloatField(data.weight),
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: resolveSource(raw, data),
  };
}

/**
 * Transform Foundry cyberware data to our schema
 */
function transformCyberware(item: FoundryItem): any {
  const raw = item as unknown as Record<string, unknown>;
  const data = getFoundryItemData(raw);

  return {
    name: String(item.name ?? data.name ?? '').trim() || 'Unknown',
    surg_code: data.surgCode || '',
    humanity_cost: data.humanityCost || '',
    humanity_loss: parseFloatField(data.humanityLoss),
    cyberware_type: data.cyberwareType || '',
    cost: parseIntField(data.cost),
    weight: parseFloatField(data.weight),
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: resolveSource(raw, data),
  };
}

/**
 * Transform Foundry gear data to our schema
 */
function transformGear(item: FoundryItem): any {
  const raw = item as unknown as Record<string, unknown>;
  const data = getFoundryItemData(raw);

  return {
    name: String(item.name ?? data.name ?? '').trim() || 'Unknown',
    cost: parseIntField(data.cost),
    weight: parseFloatField(data.weight),
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: resolveSource(raw, data),
  };
}

/**
 * Transform Foundry vehicle data to our schema
 */
function transformVehicle(item: FoundryItem): any {
  const raw = item as unknown as Record<string, unknown>;
  const data = getFoundryItemData(raw);

  return {
    name: String(item.name ?? data.name ?? '').trim() || 'Unknown',
    vehicle_type: data.vehicleType || data.vehicle_type || '',
    top_speed: parseIntField(data.topSpeed ?? data.top_speed),
    acceleration: parseIntField(data.acceleration),
    handling: parseIntField(data.handling),
    armor: parseIntField(data.armor),
    sdp: parseIntField(data.sdp),
    cost: parseIntField(data.cost),
    weight: parseFloatField(data.weight),
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: resolveSource(raw, data),
  };
}

/**
 * Transform Foundry skill data to our schema
 */
function transformSkill(item: FoundryItem): any {
  const raw = item as unknown as Record<string, unknown>;
  const data = getFoundryItemData(raw);

  return {
    name: String(item.name ?? data.name ?? '').trim() || 'Unknown',
    linked_stat: data.linkedStat || data.linked_stat || data.stat || 'INT',
    category: data.category || '',
    description: data.flavor || data.description || '',
    source: resolveSource(raw, data),
  };
}

/**
 * Transform Foundry program data to our schema (matches `programs` in schema.sql)
 */
function transformProgram(item: FoundryItem): any {
  const raw = item as unknown as Record<string, unknown>;
  const data = getFoundryItemData(raw);
  const strengthRaw = data.strength ?? data.power;
  const muRaw = data.muCost ?? data.mu_cost ?? data.mu;

  let options: string[] = [];
  if (Array.isArray(data.options)) {
    options = data.options.map((x: unknown) => String(x));
  }

  return {
    name: String(item.name ?? data.name ?? '').trim() || 'Unknown',
    program_type: data.programType || data.program_type || '',
    program_class: data.programClass || data.program_class || '',
    strength: Math.round(Number(strengthRaw)) || 0,
    mu_cost: Math.round(Number(muRaw)) || 0,
    cost: parseIntField(data.cost),
    description: data.flavor || data.description || '',
    source: resolveSource(raw, data),
    options,
  };
}

/**
 * Import data for a specific category
 */
async function importCategory(
  category: string,
  tableName: string,
  transformFn: (item: FoundryItem) => any
): Promise<void> {
  console.log(`\nImporting ${category}...`);
  
  const dataPath = path.join(__dirname, '../lib/data', `${category}.json`);
  
  if (!fs.existsSync(dataPath)) {
    console.warn(`  ⚠ Data file not found: ${category}.json`);
    return;
  }
  
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`  📄 Loaded ${rawData.length} items from ${category}.json`);
  
  // Transform data
  const transformedData = rawData.map(transformFn);
  
  // Validate data
  const validData = transformedData.filter((item: any) => {
    if (!item.name || item.name.trim() === '') {
      console.warn(`  ⚠ Skipping item with empty name`);
      return false;
    }
    return true;
  });
  
  console.log(`  ✓ Transformed ${validData.length} valid items`);
  
  // Clear existing data
  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  
  if (deleteError) {
    console.error(`  ❌ Failed to clear existing data:`, deleteError.message);
    return;
  }
  
  console.log(`  🗑️  Cleared existing data from ${tableName}`);
  
  // Insert in batches (Supabase has a limit)
  const BATCH_SIZE = 100;
  let imported = 0;
  
  for (let i = 0; i < validData.length; i += BATCH_SIZE) {
    const batch = validData.slice(i, i + BATCH_SIZE);
    
    const { error: insertError } = await supabase
      .from(tableName)
      .insert(batch);
    
    if (insertError) {
      console.error(`  ❌ Failed to insert batch ${i / BATCH_SIZE + 1}:`, insertError.message);
      console.error(`  Details:`, insertError);
    } else {
      imported += batch.length;
      console.log(`  ✓ Imported batch ${i / BATCH_SIZE + 1} (${batch.length} items)`);
    }
  }
  
  console.log(`  ✅ Successfully imported ${imported}/${validData.length} items to ${tableName}`);
}

/**
 * Main import function
 */
async function main() {
  console.log('Supabase Data Import');
  console.log('====================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('');
  
  try {
    // Test connection
    const { error } = await supabase.from('weapons').select('count').limit(1);
    if (error) {
      console.error('❌ Failed to connect to Supabase:', error.message);
      console.error('Make sure the database schema is set up and credentials are correct.');
      process.exit(1);
    }
    console.log('✓ Connected to Supabase successfully\n');
    
    // Import each category
    await importCategory('weapons', 'weapons', transformWeapon);
    await importCategory('armor', 'armor', transformArmor);
    await importCategory('cyberware', 'cyberware', transformCyberware);
    await importCategory('gear', 'gear', transformGear);
    await importCategory('vehicles', 'vehicles', transformVehicle);
    await importCategory('skills', 'skills_reference', transformSkill);
    await importCategory('programs', 'programs', transformProgram);
    
    console.log('\n✅ Import complete!');
    
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the script
main();
