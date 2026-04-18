import { describe, it, expect } from 'vitest';
import type { Character, MapCoverRegion, SessionSettings, Token } from '../types';
import { buildTacticalCoverHints, losBlockedByCover, bresenhamLine } from './tactical-cover-hint';

describe('tactical-cover-hint', () => {
  it('bresenhamLine includes endpoints', () => {
    const line = bresenhamLine(0, 0, 2, 0);
    expect(line.map((p) => `${p.c},${p.r}`).join('|')).toBe('0,0|1,0|2,0');
  });

  it('losBlockedByCover detects cover cell between observer and target', () => {
    const cover = new Set(['1,0']);
    expect(losBlockedByCover(0, 0, 2, 0, cover)).toBe(true);
    expect(losBlockedByCover(0, 0, 1, 0, cover)).toBe(true);
  });

  it('buildTacticalCoverHints prefers cells that block more enemies', () => {
    const settings: SessionSettings = {
      ttsEnabled: false,
      ttsVoice: 'default',
      autoRollDamage: true,
      allowPlayerTokenMovement: true,
      voiceInputMode: 'pushToTalk',
      sessionRecordingStartedBy: null,
      sttLanguage: 'en',
      aiLanguage: 'en',
      mapGridCols: 5,
      mapGridRows: 3,
      mapShowGrid: true,
      mapSnapToGrid: true,
      mapMetersPerSquare: 2,
    };
    const regions: MapCoverRegion[] = [
      { id: 'w', c0: 2, r0: 0, c1: 2, r1: 2, coverTypeId: 'sheetrock_wall' },
    ];
    const pc: Character = {
      id: 'pc1',
      userId: 'u',
      sessionId: 's',
      name: 'Hero',
      type: 'character',
      isNpc: false,
      team: 'party',
      imageUrl: '',
      role: 'Solo',
      age: 20,
      points: 0,
      stats: {} as Character['stats'],
      specialAbility: { name: 'x', value: 1 },
      reputation: 0,
      improvementPoints: 0,
      skills: [],
      damage: 0,
      isStunned: false,
      isStabilized: false,
      conditions: [],
      hitLocations: {} as Character['hitLocations'],
      sdp: {
        sum: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
        current: { Head: 0, Torso: 0, rArm: 0, lArm: 0, lLeg: 0, rLeg: 0 },
      },
      eurobucks: 0,
      items: [],
      combatModifiers: { initiative: 0, stunSave: 0 },
      netrunDeck: null,
      lifepath: null,
    };
    const npc: Character = { ...pc, id: 'npc1', name: 'Goon', type: 'npc', isNpc: true, team: 'hostile' };
    const tokens: Token[] = [
      { id: 't1', name: 'Hero', imageUrl: '', x: 10, y: 50, size: 50, controlledBy: 'player', characterId: 'pc1' },
      { id: 't2', name: 'Goon', imageUrl: '', x: 90, y: 50, size: 50, controlledBy: 'gm', characterId: 'npc1' },
    ];
    const hints = buildTacticalCoverHints({
      characters: [pc, npc],
      tokens,
      mapCoverRegions: regions,
      sessionSettings: settings,
      maxSuggestions: 1,
    });
    const h = hints.find((x) => x.token_id === 't1');
    expect(h).toBeDefined();
    expect(h!.suggestions.length).toBeGreaterThan(0);
    // West of the wall column should block LOS from enemy at c=4 to target
    const best = h!.suggestions[0];
    expect(best.cell_column).toBeLessThanOrEqual(1);
  });
});
