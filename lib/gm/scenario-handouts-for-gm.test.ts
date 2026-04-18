import { describe, it, expect } from 'vitest';
import {
  publicSupabaseStorageObjectUrl,
  scenarioHandoutsForSession,
  scenarioHandoutsJsonForGmSession,
} from './scenario-handouts-for-gm';
import { buildGmUserContent, buildGmSystemPrompt } from './context-builder';
import type { ChatMessage, Scene } from '../types';

const minimalScene: Scene = {
  location: 'Test',
  description: '',
  npcsPresent: [],
  situation: '',
};

const onePlayerMessage = (): ChatMessage => ({
  id: '1',
  speaker: 'P',
  text: 'hi',
  timestamp: 1,
  type: 'player',
});

describe('scenarioHandoutsForSession', () => {
  const base = 'https://cawdcuogltifglyilsey.supabase.co';

  it('matches Tales of Red session names case-insensitively', () => {
    const a = scenarioHandoutsForSession('Our first campaign — Tales of Red', base);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]).toMatchObject({
      id: 'union_chapel_basement',
      caption: expect.stringContaining('Union Chapel'),
    });
    expect(a[0].url).toBe(
      `${base}/storage/v1/object/public/scenario-images/talesofred/union_chapel_basement.jpeg`,
    );
  });

  it('matches talesofred slug', () => {
    const a = scenarioHandoutsForSession('talesofred session', base);
    expect(a.some((h) => h.id === 'union_chapel_basement')).toBe(true);
  });

  it('returns empty for unrelated session names', () => {
    expect(scenarioHandoutsForSession('Night City generic', base)).toEqual([]);
  });

  it('scenarioHandoutsJsonForGmSession returns valid JSON array', () => {
    const s = scenarioHandoutsJsonForGmSession('Tales of Red', base);
    const parsed = JSON.parse(s) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as { url: string }[])[0].url).toContain('union_chapel_basement.jpeg');
  });
});

describe('publicSupabaseStorageObjectUrl', () => {
  it('encodes path segments and strips trailing slash on project URL', () => {
    expect(
      publicSupabaseStorageObjectUrl('https://x.supabase.co/', 'scenario-images', 'a/b c/d.jpeg'),
    ).toBe('https://x.supabase.co/storage/v1/object/public/scenario-images/a/b%20c/d.jpeg');
  });

  it('returns null without base URL', () => {
    expect(publicSupabaseStorageObjectUrl(undefined, 'b', 'p')).toBeNull();
  });
});

describe('buildGmUserContent includes handouts', () => {
  it('embeds SCENARIO_SCENE_HANDOUTS_JSON with URLs when env matches', () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://cawdcuogltifglyilsey.supabase.co';
    try {
      const user = buildGmUserContent({
        sessionName: 'Tales of Red',
        sessionSummary: '',
        activeScene: minimalScene,
        characters: [],
        mapTokens: [],
        chatHistory: [onePlayerMessage()],
        playerMessage: 'look around',
        messageSpeaker: 'PC',
        loreInjection: '',
      });
      expect(user).toContain('SCENARIO_SCENE_HANDOUTS_JSON:');
      expect(user).toContain('union_chapel_basement');
      expect(user).toContain('scenario-images');
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
    expect(buildGmSystemPrompt(null).length).toBeGreaterThan(100);
  });
});
