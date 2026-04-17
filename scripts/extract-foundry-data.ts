/**
 * Script to extract Foundry VTT compendium data from .db files to JSON
 * 
 * Foundry .db files are newline-delimited JSON (NDJSON) format.
 * This script reads them and converts to proper JSON arrays.
 */

import * as fs from 'fs';
import * as path from 'path';

// Define the packs we want to extract
const PACK_MAPPINGS = {
  // Weapons
  weapons: ['pistols.db', 'pistols-add.db', 'rifles.db', 'rifles-add.db', 'shotguns.db', 'submachineguns.db', 'smgs-add.db', 'heavy.db', 'melee.db', 'cyberweapons.db'],
  
  // Armor
  armor: ['armor.db', 'armor-add.db'],
  
  // Cyberware (all types)
  cyberware: ['bioware.db', 'chipware.db', 'cyberaudio.db', 'cyberlimbs.db', 'cyberoptic.db', 'neuralware.db', 'implants.db', 'other-cyberware.db', 'fashonware.db'],
  
  // Skills
  skills: ['default-skills.db', 'default-skills-en.db', 'role-skills-en.db'],
  
  // Gear
  gear: ['communication.db', 'electronics.db', 'entertainment.db', 'fashion.db', 'furnishing.db', 'medical.db', 'security.db', 'surveillance.db', 'tools.db', 'netrunningEquipment.db'],
  
  // Vehicles
  vehicles: ['vehicles.db'],
  
  // Programs
  programs: ['programs.db']
};

interface FoundryItem {
  _id: string;
  name: string;
  type: string;
  img: string;
  data: any;
  effects?: any[];
  folder?: string | null;
  sort?: number;
  permission?: any;
  flags?: any;
}

/**
 * Parse a Foundry .db file (NDJSON format)
 */
function parseFoundryDB(filePath: string): FoundryItem[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    
    const items: FoundryItem[] = [];
    for (const line of lines) {
      if (line.trim()) {
        try {
          const item = JSON.parse(line);
          items.push(item);
        } catch {
          console.warn(`Failed to parse line in ${filePath}:`, line.substring(0, 100));
        }
      }
    }
    
    return items;
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err);
    return [];
  }
}

/**
 * Extract and combine multiple pack files into a single category
 */
function extractCategory(category: string, packFiles: string[], packsDir: string, outputDir: string): void {
  console.log(`\nExtracting ${category}...`);
  
  const allItems: FoundryItem[] = [];
  
  for (const packFile of packFiles) {
    const packPath = path.join(packsDir, packFile);
    
    if (!fs.existsSync(packPath)) {
      console.warn(`  ⚠ Pack file not found: ${packFile}`);
      continue;
    }
    
    const items = parseFoundryDB(packPath);
    console.log(`  ✓ ${packFile}: ${items.length} items`);
    allItems.push(...items);
  }
  
  // Write combined output
  const outputPath = path.join(outputDir, `${category}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allItems, null, 2));
  console.log(`  → Saved ${allItems.length} total items to ${category}.json`);
}

/**
 * Main extraction function
 */
function main() {
  // Determine paths
  const rootDir = path.resolve(__dirname, '../..');
  const packsDir = path.join(rootDir, 'packs');
  const outputDir = path.join(__dirname, '../lib/data');
  
  console.log('Foundry Data Extraction');
  console.log('=======================');
  console.log(`Packs directory: ${packsDir}`);
  console.log(`Output directory: ${outputDir}`);
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }
  
  // Extract each category
  for (const [category, packFiles] of Object.entries(PACK_MAPPINGS)) {
    extractCategory(category, packFiles, packsDir, outputDir);
  }
  
  console.log('\n✅ Extraction complete!');
}

// Run the script
main();
