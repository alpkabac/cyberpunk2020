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
  _id: string;
  name: string;
  type: string;
  img: string;
  data: any;
}

/**
 * Transform Foundry weapon data to our schema
 */
function transformWeapon(item: FoundryItem): any {
  const data = item.data;
  
  return {
    name: item.name,
    weapon_type: data.weaponType || 'Unknown',
    accuracy: parseInt(data.accuracy) || 0,
    concealability: data.concealability || '',
    availability: data.availability || '',
    ammo_type: data.ammoType || '',
    damage: data.damage || '1d6',
    ap: data.ap || false,
    shots: parseInt(data.shots) || 0,
    rof: parseInt(data.rof) || 1,
    reliability: data.reliability || 'ST',
    range: parseInt(data.range) || 0,
    attack_type: data.attackType || '',
    attack_skill: data.attackSkill || '',
    cost: parseInt(data.cost) || 0,
    weight: parseFloat(data.weight) || 0,
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: data.source || item.data.source || 'Cyberpunk 2020'
  };
}

/**
 * Transform Foundry armor data to our schema
 */
function transformArmor(item: FoundryItem): any {
  const data = item.data;
  
  // Extract coverage data
  const coverage = data.coverage || {};
  
  return {
    name: item.name,
    coverage: coverage,
    encumbrance: parseInt(data.encumbrance) || 0,
    cost: parseInt(data.cost) || 0,
    weight: parseFloat(data.weight) || 0,
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: data.source || 'Cyberpunk 2020'
  };
}

/**
 * Transform Foundry cyberware data to our schema
 */
function transformCyberware(item: FoundryItem): any {
  const data = item.data;
  
  return {
    name: item.name,
    surg_code: data.surgCode || '',
    humanity_cost: data.humanityCost || '',
    humanity_loss: parseFloat(data.humanityLoss) || 0,
    cyberware_type: data.cyberwareType || '',
    cost: parseInt(data.cost) || 0,
    weight: parseFloat(data.weight) || 0,
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: data.source || 'Cyberpunk 2020'
  };
}

/**
 * Transform Foundry gear data to our schema
 */
function transformGear(item: FoundryItem): any {
  const data = item.data;
  
  return {
    name: item.name,
    cost: parseInt(data.cost) || 0,
    weight: parseFloat(data.weight) || 0,
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: data.source || 'Cyberpunk 2020'
  };
}

/**
 * Transform Foundry vehicle data to our schema
 */
function transformVehicle(item: FoundryItem): any {
  const data = item.data;
  
  return {
    name: item.name,
    vehicle_type: data.vehicleType || '',
    top_speed: parseInt(data.topSpeed) || 0,
    acceleration: parseInt(data.acceleration) || 0,
    handling: parseInt(data.handling) || 0,
    armor: parseInt(data.armor) || 0,
    sdp: parseInt(data.sdp) || 0,
    cost: parseInt(data.cost) || 0,
    weight: parseFloat(data.weight) || 0,
    flavor: data.flavor || '',
    notes: data.notes || '',
    source: data.source || 'Cyberpunk 2020'
  };
}

/**
 * Transform Foundry skill data to our schema
 */
function transformSkill(item: FoundryItem): any {
  const data = item.data;
  
  return {
    name: item.name,
    linked_stat: data.linkedStat || data.stat || 'INT',
    category: data.category || '',
    description: data.flavor || data.description || '',
    source: data.source || 'Cyberpunk 2020'
  };
}

/**
 * Transform Foundry program data to our schema
 */
function transformProgram(item: FoundryItem): any {
  const data = item.data;
  
  return {
    name: item.name,
    program_type: data.programType || '',
    strength: parseInt(data.strength) || 0,
    mu_cost: parseInt(data.muCost) || 0,
    cost: parseInt(data.cost) || 0,
    description: data.flavor || data.description || '',
    source: data.source || 'Cyberpunk 2020'
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
    const { data, error } = await supabase.from('weapons').select('count').limit(1);
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
