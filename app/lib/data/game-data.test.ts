/**
 * Tests for Game Data Access Layer
 * 
 * These tests verify the data access functions work correctly.
 * Note: These tests require a configured Supabase instance with data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearCache,
  getAllWeapons,
  getWeaponByName,
  getWeaponsByType,
  searchWeapons,
  getAllArmor,
  getArmorByName,
  getAllCyberware,
  getCyberwareByType,
  getAllSkills,
  getSkillByName,
  searchAllItems,
} from './game-data';

describe('Game Data Access Layer', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearCache();
  });

  describe('Cache Management', () => {
    it('should cache data after first fetch', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const weapons1 = await getAllWeapons();
      const weapons2 = await getAllWeapons();

      // Should return the same array reference (cached)
      expect(weapons1).toBe(weapons2);
    });

    it('should clear cache when requested', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const weapons1 = await getAllWeapons();
      clearCache();
      const weapons2 = await getAllWeapons();

      // Should return different array references after cache clear
      expect(weapons1).not.toBe(weapons2);
    });
  });

  describe('Weapons', () => {
    it('should fetch all weapons', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const weapons = await getAllWeapons();
      expect(Array.isArray(weapons)).toBe(true);
    });

    it('should find weapon by exact name', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const weapons = await getAllWeapons();
      if (weapons.length === 0) return;

      const firstWeapon = weapons[0];
      const found = await getWeaponByName(firstWeapon.name);

      expect(found).not.toBeNull();
      expect(found?.name).toBe(firstWeapon.name);
    });

    it('should filter weapons by type', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const weapons = await getAllWeapons();
      if (weapons.length === 0) return;

      const firstType = weapons[0].weapon_type;
      const filtered = await getWeaponsByType(firstType);

      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(w => {
        expect(w.weapon_type.toLowerCase()).toBe(firstType.toLowerCase());
      });
    });

    it('should search weapons by partial name', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const weapons = await getAllWeapons();
      if (weapons.length === 0) return;

      const firstWeapon = weapons[0];
      const searchTerm = firstWeapon.name.substring(0, 3);
      const results = await searchWeapons(searchTerm);

      expect(results.length).toBeGreaterThan(0);
      results.forEach(w => {
        expect(w.name.toLowerCase()).toContain(searchTerm.toLowerCase());
      });
    });
  });

  describe('Armor', () => {
    it('should fetch all armor', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const armor = await getAllArmor();
      expect(Array.isArray(armor)).toBe(true);
    });

    it('should find armor by exact name', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const armor = await getAllArmor();
      if (armor.length === 0) return;

      const firstArmor = armor[0];
      const found = await getArmorByName(firstArmor.name);

      expect(found).not.toBeNull();
      expect(found?.name).toBe(firstArmor.name);
    });
  });

  describe('Cyberware', () => {
    it('should fetch all cyberware', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const cyberware = await getAllCyberware();
      expect(Array.isArray(cyberware)).toBe(true);
    });

    it('should filter cyberware by type', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const cyberware = await getAllCyberware();
      if (cyberware.length === 0) return;

      const firstType = cyberware[0].cyberware_type;
      if (!firstType) return;

      const filtered = await getCyberwareByType(firstType);

      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(c => {
        expect(c.cyberware_type.toLowerCase()).toBe(firstType.toLowerCase());
      });
    });
  });

  describe('Skills', () => {
    it('should fetch all skills', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const skills = await getAllSkills();
      expect(Array.isArray(skills)).toBe(true);
    });

    it('should find skill by exact name', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const skills = await getAllSkills();
      if (skills.length === 0) return;

      const firstSkill = skills[0];
      const found = await getSkillByName(firstSkill.name);

      expect(found).not.toBeNull();
      expect(found?.name).toBe(firstSkill.name);
    });
  });

  describe('Generic Search', () => {
    it('should search across all item types', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      // Search for a common term
      const results = await searchAllItems('armor');

      expect(Array.isArray(results)).toBe(true);
      
      // Results should have type and item
      results.forEach(result => {
        expect(result.type).toBeDefined();
        expect(result.item).toBeDefined();
        expect(['weapon', 'armor', 'cyberware', 'gear', 'vehicle', 'program']).toContain(result.type);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should return items with required fields', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const weapons = await getAllWeapons();
      if (weapons.length === 0) return;

      const weapon = weapons[0];
      expect(weapon.id).toBeDefined();
      expect(weapon.name).toBeDefined();
      expect(weapon.weapon_type).toBeDefined();
      expect(weapon.damage).toBeDefined();
    });

    it('should handle missing data gracefully', async () => {
      // Skip if Supabase not configured
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return;
      }

      const result = await getWeaponByName('NonExistentWeapon12345');
      expect(result).toBeNull();
    });
  });
});
