/**
 * Data Layer Exports
 * 
 * Central export point for all data access functions
 */

export {
  // Types
  type Weapon,
  type Armor,
  type Cyberware,
  type Gear,
  type Vehicle,
  type Skill,
  type Program,
  type SearchResult,
  
  // Cache management
  clearCache,
  
  // Weapons
  getAllWeapons,
  getWeaponByName,
  getWeaponsByType,
  searchWeapons,
  
  // Armor
  getAllArmor,
  getArmorByName,
  searchArmor,
  
  // Cyberware
  getAllCyberware,
  getCyberwareByName,
  getCyberwareByType,
  searchCyberware,
  
  // Gear
  getAllGear,
  getGearByName,
  searchGear,
  
  // Vehicles
  getAllVehicles,
  getVehicleByName,
  getVehiclesByType,
  searchVehicles,
  
  // Skills
  getAllSkills,
  getSkillByName,
  getSkillsByCategory,
  
  // Programs
  getAllPrograms,
  getProgramByName,
  getProgramsByType,
  searchPrograms,
  
  // Generic search
  searchAllItems,
} from './game-data';
