/**
 * Data Access Layer for Game Reference Data
 *
 * Provides functions to query weapons, armor, cyberware, etc.
 * Uses Supabase when configured, falls back to local JSON files.
 */

import { createClient } from '@supabase/supabase-js';

// Local JSON imports (bundled at build time)
import localWeapons from './weapons.json';
import localArmor from './armor.json';
import localCyberware from './cyberware.json';
import localGear from './gear.json';
import localVehicles from './vehicles.json';
import localPrograms from './programs.json';
import localSkills from './skills.json';

// ============================================================================
// Supabase Client (optional)
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient(): ReturnType<typeof createClient> | null {
  if (!supabaseUrl || !supabaseKey) return null;
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

function isSupabaseAvailable(): boolean {
  return getSupabaseClient() !== null;
}

// ============================================================================
// Type Definitions (data-layer specific — may differ from core types)
// ============================================================================

export interface Weapon {
  id: string;
  name: string;
  weapon_type: string;
  accuracy: number;
  concealability: string;
  availability: string;
  ammo_type: string;
  damage: string;
  ap: boolean;
  shots: number;
  rof: number;
  reliability: string;
  range: number;
  attack_type: string;
  attack_skill: string;
  cost: number;
  weight: number;
  flavor: string;
  notes: string;
  source: string;
}

export interface Armor {
  id: string;
  name: string;
  coverage: Record<string, { stoppingPower: number; ablation: number }>;
  encumbrance: number;
  cost: number;
  weight: number;
  flavor: string;
  notes: string;
  source: string;
}

export interface Cyberware {
  id: string;
  name: string;
  surg_code: string;
  humanity_cost: string;
  humanity_loss: number;
  cyberware_type: string;
  cost: number;
  weight: number;
  flavor: string;
  notes: string;
  source: string;
}

export interface Gear {
  id: string;
  name: string;
  cost: number;
  weight: number;
  flavor: string;
  notes: string;
  source: string;
}

export interface Vehicle {
  id: string;
  name: string;
  vehicle_type: string;
  top_speed: number;
  acceleration: number;
  handling: number;
  armor: number;
  sdp: number;
  cost: number;
  weight: number;
  flavor: string;
  notes: string;
  source: string;
}

export interface Skill {
  id: string;
  name: string;
  linked_stat: string;
  category: string;
  description: string;
  source: string;
}

export interface Program {
  id: string;
  name: string;
  program_type: string;
  strength: number;
  mu_cost: number;
  cost: number;
  description: string;
  source: string;
}

// ============================================================================
// Local JSON Normalization
// ============================================================================

/**
 * Normalize Foundry VTT export format items into flat data-layer format.
 * Foundry items have nested { _id, name, data: { ... } } structure.
 */
/**
 * Foundry exports usually set humanityLoss to null and put dice in humanityCost ("2d6", "1d6/2").
 * CP2020 rolls at install; for automation we use the average roll (rounded).
 */
export function estimateHumanityLossFromHumanityCost(humanityCost: string): number {
  const s = humanityCost.trim().toLowerCase().replace(/\s/g, '');
  if (!s || s === '0') return 0;

  const divMatch = s.match(/^(\d+)d(\d+)([+-]\d+)?\/(\d+)$/);
  if (divMatch) {
    const count = parseInt(divMatch[1], 10);
    const sides = parseInt(divMatch[2], 10);
    const mod = divMatch[3] ? parseInt(divMatch[3], 10) : 0;
    const div = parseInt(divMatch[4], 10);
    const mean = count * ((sides + 1) / 2) + mod;
    return Math.max(0, Math.round(mean / div));
  }

  const stdMatch = s.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (stdMatch) {
    const count = parseInt(stdMatch[1], 10);
    const sides = parseInt(stdMatch[2], 10);
    const mod = stdMatch[3] ? parseInt(stdMatch[3], 10) : 0;
    return Math.round(count * ((sides + 1) / 2) + mod);
  }

  const n = Number(s);
  if (!Number.isNaN(n) && n > 0) return Math.round(n);

  return 0;
}

/** Prefer numeric humanityLoss from data; otherwise derive average from humanityCost dice string. */
export function resolveCyberwareHumanityLoss(
  humanityLoss: number | null | undefined,
  humanityCost: string,
): number {
  const hl = Number(humanityLoss);
  if (!Number.isNaN(hl) && hl > 0) return hl;
  return estimateHumanityLossFromHumanityCost(humanityCost || '');
}

function normalizeFoundryItem(raw: Record<string, unknown>): Record<string, unknown> {
  const data = (raw.data || raw.system || {}) as Record<string, unknown>;
  return {
    ...data,
    id: raw._id || raw.id || String(Math.random()),
    name: raw.name || 'Unknown',
    flavor: data.flavor || '',
    notes: data.notes || '',
    cost: Number(data.cost) || 0,
    weight: Number(data.weight) || 0,
    source: String(data.source || 'Local'),
  };
}

function normalizeLocalWeapons(): Weapon[] {
  return (localWeapons as Record<string, unknown>[]).map((raw) => {
    const n = normalizeFoundryItem(raw);
    return {
      id: String(n.id),
      name: String(n.name),
      weapon_type: String(n.weaponType || ''),
      accuracy: Number(n.accuracy) || 0,
      concealability: String(n.concealability || ''),
      availability: String(n.availability || ''),
      ammo_type: String(n.ammoType || ''),
      damage: String(n.damage || '0'),
      ap: Boolean(n.ap),
      shots: Number(n.shots) || 0,
      rof: Number(n.rof) || 1,
      reliability: String(n.reliability || 'ST'),
      range: Number(n.range) || 0,
      attack_type: String(n.attackType || ''),
      attack_skill: String(n.attackSkill || ''),
      cost: Number(n.cost) || 0,
      weight: Number(n.weight) || 0,
      flavor: String(n.flavor || ''),
      notes: String(n.notes || ''),
      source: String(n.source || 'Local'),
    };
  });
}

function normalizeCoverage(
  raw: unknown,
): Record<string, { stoppingPower: number; ablation: number }> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, { stoppingPower: number; ablation: number }> = {};
  for (const [zone, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === 'object') {
      const v = val as Record<string, unknown>;
      result[zone] = {
        stoppingPower: Number(v.stoppingPower) || 0,
        ablation: Number(v.ablation) || 0,
      };
    }
  }
  return result;
}

function normalizeLocalArmor(): Armor[] {
  return (localArmor as Record<string, unknown>[]).map((raw) => {
    const n = normalizeFoundryItem(raw);
    return {
      id: String(n.id),
      name: String(n.name),
      coverage: normalizeCoverage(n.coverage),
      encumbrance: Number(n.encumbrance) || 0,
      cost: Number(n.cost) || 0,
      weight: Number(n.weight) || 0,
      flavor: String(n.flavor || ''),
      notes: String(n.notes || ''),
      source: String(n.source || 'Local'),
    };
  });
}

function normalizeLocalCyberware(): Cyberware[] {
  return (localCyberware as Record<string, unknown>[]).map((raw) => {
    const n = normalizeFoundryItem(raw);
    const hc = String(n.humanityCost || n.humanity_cost || '');
    return {
      id: String(n.id),
      name: String(n.name),
      surg_code: String(n.surgCode || n.surg_code || ''),
      humanity_cost: hc || '0',
      humanity_loss: resolveCyberwareHumanityLoss(
        Number(n.humanityLoss ?? n.humanity_loss) || 0,
        hc,
      ),
      cyberware_type: String(n.cyberwareType || n.cyberware_type || ''),
      cost: Number(n.cost) || 0,
      weight: Number(n.weight) || 0,
      flavor: String(n.flavor || ''),
      notes: String(n.notes || ''),
      source: String(n.source || 'Local'),
    };
  });
}

function normalizeLocalGear(): Gear[] {
  return (localGear as Record<string, unknown>[]).map((raw) => {
    const n = normalizeFoundryItem(raw);
    return {
      id: String(n.id),
      name: String(n.name),
      cost: Number(n.cost) || 0,
      weight: Number(n.weight) || 0,
      flavor: String(n.flavor || ''),
      notes: String(n.notes || ''),
      source: String(n.source || 'Local'),
    };
  });
}

function normalizeLocalVehicles(): Vehicle[] {
  return (localVehicles as Record<string, unknown>[]).map((raw) => {
    const n = normalizeFoundryItem(raw);
    return {
      id: String(n.id),
      name: String(n.name),
      vehicle_type: String(n.vehicleType || n.vehicle_type || ''),
      top_speed: Number(n.topSpeed || n.top_speed) || 0,
      acceleration: Number(n.acceleration) || 0,
      handling: Number(n.handling) || 0,
      armor: Number(n.armor) || 0,
      sdp: Number(n.sdp) || 0,
      cost: Number(n.cost) || 0,
      weight: Number(n.weight) || 0,
      flavor: String(n.flavor || ''),
      notes: String(n.notes || ''),
      source: String(n.source || 'Local'),
    };
  });
}

function normalizeLocalPrograms(): Program[] {
  return (localPrograms as Record<string, unknown>[]).map((raw) => {
    const n = normalizeFoundryItem(raw);
    return {
      id: String(n.id),
      name: String(n.name),
      program_type: String(n.programType || n.program_type || ''),
      strength: Number(n.strength) || 0,
      mu_cost: Number(n.muCost || n.mu_cost) || 0,
      cost: Number(n.cost) || 0,
      description: String(n.flavor || n.description || ''),
      source: String(n.source || 'Local'),
    };
  });
}

function normalizeLocalSkills(): Skill[] {
  return (localSkills as Record<string, unknown>[]).map((raw) => {
    const n = normalizeFoundryItem(raw);
    return {
      id: String(n.id),
      name: String(n.name),
      linked_stat: String(n.linkedStat || n.linked_stat || 'int'),
      category: String(n.category || ''),
      description: String(n.flavor || n.description || ''),
      source: String(n.source || 'Local'),
    };
  });
}

// ============================================================================
// Cache Management
// ============================================================================

interface Cache<T> {
  data: T[] | null;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000;

const cache: {
  weapons: Cache<Weapon>;
  armor: Cache<Armor>;
  cyberware: Cache<Cyberware>;
  gear: Cache<Gear>;
  vehicles: Cache<Vehicle>;
  skills: Cache<Skill>;
  programs: Cache<Program>;
} = {
  weapons: { data: null, timestamp: 0 },
  armor: { data: null, timestamp: 0 },
  cyberware: { data: null, timestamp: 0 },
  gear: { data: null, timestamp: 0 },
  vehicles: { data: null, timestamp: 0 },
  skills: { data: null, timestamp: 0 },
  programs: { data: null, timestamp: 0 },
};

function isCacheValid<T>(c: Cache<T>): boolean {
  return c.data !== null && Date.now() - c.timestamp < CACHE_TTL;
}

export function clearCache(): void {
  for (const key of Object.keys(cache) as Array<keyof typeof cache>) {
    cache[key] = { data: null, timestamp: 0 };
  }
}

// ============================================================================
// Generic fetch helper: tries Supabase, falls back to local JSON
// ============================================================================

async function fetchData<T>(
  table: string,
  cacheEntry: Cache<T>,
  localFallback: () => T[],
): Promise<T[]> {
  if (isCacheValid(cacheEntry)) {
    return cacheEntry.data!;
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client.from(table).select('*').order('name');
      if (!error && data) {
        cacheEntry.data = data;
        cacheEntry.timestamp = Date.now();
        return data;
      }
    } catch {
      // Supabase unavailable, fall through to local
    }
  }

  // Local JSON fallback
  const localData = localFallback();
  cacheEntry.data = localData;
  cacheEntry.timestamp = Date.now();
  return localData;
}

// ============================================================================
// Weapons
// ============================================================================

export async function getAllWeapons(): Promise<Weapon[]> {
  return fetchData('weapons', cache.weapons, normalizeLocalWeapons);
}

export async function getWeaponByName(name: string): Promise<Weapon | null> {
  const weapons = await getAllWeapons();
  return weapons.find((w) => w.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function getWeaponsByType(type: string): Promise<Weapon[]> {
  const weapons = await getAllWeapons();
  return weapons.filter((w) => w.weapon_type.toLowerCase() === type.toLowerCase());
}

export async function searchWeapons(query: string): Promise<Weapon[]> {
  const weapons = await getAllWeapons();
  const q = query.toLowerCase();
  return weapons.filter((w) => w.name.toLowerCase().includes(q));
}

// ============================================================================
// Armor
// ============================================================================

export async function getAllArmor(): Promise<Armor[]> {
  return fetchData('armor', cache.armor, normalizeLocalArmor);
}

export async function getArmorByName(name: string): Promise<Armor | null> {
  const armor = await getAllArmor();
  return armor.find((a) => a.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function searchArmor(query: string): Promise<Armor[]> {
  const armor = await getAllArmor();
  const q = query.toLowerCase();
  return armor.filter((a) => a.name.toLowerCase().includes(q));
}

// ============================================================================
// Cyberware
// ============================================================================

export async function getAllCyberware(): Promise<Cyberware[]> {
  return fetchData('cyberware', cache.cyberware, normalizeLocalCyberware);
}

export async function getCyberwareByName(name: string): Promise<Cyberware | null> {
  const cyberware = await getAllCyberware();
  return cyberware.find((c) => c.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function getCyberwareByType(type: string): Promise<Cyberware[]> {
  const cyberware = await getAllCyberware();
  return cyberware.filter((c) => c.cyberware_type.toLowerCase() === type.toLowerCase());
}

export async function searchCyberware(query: string): Promise<Cyberware[]> {
  const cyberware = await getAllCyberware();
  const q = query.toLowerCase();
  return cyberware.filter((c) => c.name.toLowerCase().includes(q));
}

// ============================================================================
// Gear
// ============================================================================

export async function getAllGear(): Promise<Gear[]> {
  return fetchData('gear', cache.gear, normalizeLocalGear);
}

export async function getGearByName(name: string): Promise<Gear | null> {
  const gear = await getAllGear();
  return gear.find((g) => g.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function searchGear(query: string): Promise<Gear[]> {
  const gear = await getAllGear();
  const q = query.toLowerCase();
  return gear.filter((g) => g.name.toLowerCase().includes(q));
}

// ============================================================================
// Vehicles
// ============================================================================

export async function getAllVehicles(): Promise<Vehicle[]> {
  return fetchData('vehicles', cache.vehicles, normalizeLocalVehicles);
}

export async function getVehicleByName(name: string): Promise<Vehicle | null> {
  const vehicles = await getAllVehicles();
  return vehicles.find((v) => v.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function getVehiclesByType(type: string): Promise<Vehicle[]> {
  const vehicles = await getAllVehicles();
  return vehicles.filter((v) => v.vehicle_type.toLowerCase() === type.toLowerCase());
}

export async function searchVehicles(query: string): Promise<Vehicle[]> {
  const vehicles = await getAllVehicles();
  const q = query.toLowerCase();
  return vehicles.filter((v) => v.name.toLowerCase().includes(q));
}

// ============================================================================
// Skills
// ============================================================================

export async function getAllSkills(): Promise<Skill[]> {
  return fetchData('skills_reference', cache.skills, normalizeLocalSkills);
}

export async function getSkillByName(name: string): Promise<Skill | null> {
  const skills = await getAllSkills();
  return skills.find((s) => s.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function getSkillsByCategory(category: string): Promise<Skill[]> {
  const skills = await getAllSkills();
  return skills.filter((s) => s.category.toLowerCase() === category.toLowerCase());
}

// ============================================================================
// Programs
// ============================================================================

export async function getAllPrograms(): Promise<Program[]> {
  return fetchData('programs', cache.programs, normalizeLocalPrograms);
}

export async function getProgramByName(name: string): Promise<Program | null> {
  const programs = await getAllPrograms();
  return programs.find((p) => p.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function getProgramsByType(type: string): Promise<Program[]> {
  const programs = await getAllPrograms();
  return programs.filter((p) => p.program_type.toLowerCase() === type.toLowerCase());
}

export async function searchPrograms(query: string): Promise<Program[]> {
  const programs = await getAllPrograms();
  const q = query.toLowerCase();
  return programs.filter((p) => p.name.toLowerCase().includes(q));
}

// ============================================================================
// Generic Search
// ============================================================================

export interface SearchResult {
  type: 'weapon' | 'armor' | 'cyberware' | 'gear' | 'vehicle' | 'program';
  item: Weapon | Armor | Cyberware | Gear | Vehicle | Program;
}

export async function searchAllItems(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  const [weapons, armor, cyberware, gear, vehicles, programs] = await Promise.all([
    searchWeapons(query),
    searchArmor(query),
    searchCyberware(query),
    searchGear(query),
    searchVehicles(query),
    searchPrograms(query),
  ]);

  weapons.forEach((item) => results.push({ type: 'weapon', item }));
  armor.forEach((item) => results.push({ type: 'armor', item }));
  cyberware.forEach((item) => results.push({ type: 'cyberware', item }));
  gear.forEach((item) => results.push({ type: 'gear', item }));
  vehicles.forEach((item) => results.push({ type: 'vehicle', item }));
  programs.forEach((item) => results.push({ type: 'program', item }));

  return results;
}
