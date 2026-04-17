import { describe, it, expect } from 'vitest';
import {
  clearCache,
  getAllWeapons,
  getAllArmor,
  getAllCyberware,
  getAllGear,
  getAllVehicles,
  getAllPrograms,
  searchAllItems,
  estimateHumanityLossFromHumanityCost,
  resolveCyberwareHumanityLoss,
} from './game-data';

describe('Local JSON Fallback (no Supabase)', () => {
  it('should load weapons from local JSON', async () => {
    clearCache();
    const weapons = await getAllWeapons();
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons[0].name).not.toBe('Common');
  });

  it('should load armor from local JSON', async () => {
    clearCache();
    const armor = await getAllArmor();
    expect(armor.length).toBeGreaterThan(0);
    expect(armor[0].name).not.toBe('Common');
  });

  it('should load cyberware from local JSON', async () => {
    clearCache();
    const cyberware = await getAllCyberware();
    expect(cyberware.length).toBeGreaterThan(0);
  });

  it('cyberware resolves HL from humanityCost dice when Foundry leaves humanity_loss null', async () => {
    clearCache();
    const cyberware = await getAllCyberware();
    const grafted = cyberware.find((c) => c.name.includes('Grafted Muscle'));
    expect(grafted).toBeDefined();
    expect(grafted!.humanity_cost).toMatch(/2d6/i);
    expect(grafted!.humanity_loss).toBe(7);
  });

  it('Kerenzikov-style ware exposes initiative_bonus for sheet / dice roller', async () => {
    clearCache();
    const cyberware = await getAllCyberware();
    const ker = cyberware.find((c) => c.name.toLowerCase().includes('kerenzikov'));
    expect(ker).toBeDefined();
    expect(ker!.initiative_bonus).toBeGreaterThanOrEqual(1);
  });

  it('estimateHumanityLossFromHumanityCost averages dice strings', () => {
    expect(estimateHumanityLossFromHumanityCost('2d6')).toBe(7);
    expect(estimateHumanityLossFromHumanityCost('1d6/2')).toBe(2);
    expect(resolveCyberwareHumanityLoss(0, '2d6')).toBe(7);
    expect(resolveCyberwareHumanityLoss(3, '2d6')).toBe(3);
  });

  it('should load gear from local JSON', async () => {
    clearCache();
    const gear = await getAllGear();
    expect(gear.length).toBeGreaterThan(0);
    expect(gear[0].name).not.toBe('Common');
  });

  it('should load vehicles from local JSON', async () => {
    clearCache();
    const vehicles = await getAllVehicles();
    expect(vehicles.length).toBeGreaterThan(0);
    expect(vehicles[0].name).not.toBe('Common');
  });

  it('should load programs from local JSON', async () => {
    clearCache();
    const programs = await getAllPrograms();
    expect(programs.length).toBeGreaterThan(0);
  });

  it('should search across all items by name', async () => {
    clearCache();
    const results = await searchAllItems('pistol');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('weapon');
  });

  it('armor coverage should have numeric SP values', async () => {
    clearCache();
    const armor = await getAllArmor();
    const withCoverage = armor.find(
      (a) => Object.values(a.coverage).some((v) => v.stoppingPower > 0),
    );
    expect(withCoverage).toBeDefined();
    const sp = Object.values(withCoverage!.coverage)[0].stoppingPower;
    expect(typeof sp).toBe('number');
  });
});
