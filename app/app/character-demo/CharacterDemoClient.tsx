'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { CharacterSheet, DiceRoller } from '@/components/character';
import { supabase } from '@/lib/supabase';
import { useGameStore } from '@/lib/store/game-store';
import { Character, createStatBlock, ROLE_SPECIAL_ABILITIES, Weapon, Armor, Cyberware } from '@/lib/types';
import { useSessionRealtimeSync } from '@/lib/hooks/useSessionRealtimeSync';
import { useCharacterCloudSync } from '@/lib/hooks/useCharacterCloudSync';
import { useShallow } from 'zustand/react/shallow';

export function CharacterDemoClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const characterParam = searchParams.get('character');

  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState<string>('');
  const [cloudHydrated, setCloudHydrated] = useState(!sessionId);

  const addCharacter = useGameStore((s) => s.addCharacter);
  const characters = useGameStore(
    useShallow((s) => ({ byId: s.characters.byId, allIds: s.characters.allIds })),
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const syncKey = `${sessionId ?? ''}|${user?.id ?? ''}`;
  const [prevSyncKey, setPrevSyncKey] = useState<string | null>(null);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setCloudHydrated(!sessionId || !user);
  }

  const onSyncComplete = useCallback(() => {
    setSyncHint('Session loaded — edits save to Supabase.');
    setCloudHydrated(true);
  }, []);

  useSessionRealtimeSync(supabase, sessionId, user?.id, onSyncComplete);

  const resolvedCharacterId = useMemo(() => {
    if (characterParam && characters.byId[characterParam]) return characterParam;
    if (characterParam) return null;
    const mine = user?.id
      ? characters.allIds.find((id) => characters.byId[id]?.userId === user.id)
      : undefined;
    return mine ?? characters.allIds[0] ?? null;
  }, [characterParam, characters.allIds, characters.byId, user]);

  const cloudSync = Boolean(sessionId && user?.id && resolvedCharacterId);

  useCharacterCloudSync(supabase, resolvedCharacterId, cloudSync);

  useEffect(() => {
    if (sessionId) return;
    if (characters.allIds.length > 0) return;

    const demoCharacter: Character = {
      id: 'demo-char-1',
      userId: 'demo-user',
      sessionId: 'demo-session',
      name: 'Johnny Silverhand',
      type: 'character',
      isNpc: false,
      team: 'party',
      imageUrl: '',
      role: 'Rockerboy',
      age: 32,
      points: 60,
      stats: {
        int: createStatBlock(7),
        ref: createStatBlock(8),
        tech: createStatBlock(5),
        cool: createStatBlock(9),
        attr: createStatBlock(8),
        luck: createStatBlock(6),
        ma: createStatBlock(7),
        bt: createStatBlock(8),
        emp: createStatBlock(4),
      },
      specialAbility: {
        name: ROLE_SPECIAL_ABILITIES['Rockerboy'],
        value: 7,
      },
      reputation: 8,
      improvementPoints: 15,
      skills: [
        { id: 'skill-1', name: 'Handgun', value: 6, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-2', name: 'Brawling', value: 5, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-3', name: 'Streetwise', value: 7, linkedStat: 'cool', category: 'COOL', isChipped: false },
        { id: 'skill-4', name: 'Awareness/Notice', value: 6, linkedStat: 'int', category: 'INT', isChipped: false },
        { id: 'skill-5', name: 'Perform', value: 8, linkedStat: 'emp', category: 'EMP', isChipped: false },
        { id: 'skill-6', name: 'Play Instrument', value: 7, linkedStat: 'tech', category: 'TECH', isChipped: false },
        { id: 'skill-7', name: 'Persuasion & Fast Talk', value: 5, linkedStat: 'emp', category: 'EMP', isChipped: false },
        { id: 'skill-8', name: 'Melee', value: 4, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-9', name: 'Dodge & Escape', value: 4, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-10', name: 'Athletics', value: 3, linkedStat: 'ref', category: 'REF', isChipped: false },
        { id: 'skill-11', name: 'Stealth', value: 3, linkedStat: 'ref', category: 'REF', isChipped: true },
        { id: 'skill-12', name: 'Rifle', value: 4, linkedStat: 'ref', category: 'REF', isChipped: false },
      ],
      damage: 6,
      isStunned: false,
      isStabilized: false,
      conditions: [],
      hitLocations: {
        Head: { location: [1], stoppingPower: 14, ablation: 0 },
        Torso: { location: [2, 3, 4], stoppingPower: 18, ablation: 2 },
        rArm: { location: [5], stoppingPower: 14, ablation: 1 },
        lArm: { location: [6], stoppingPower: 0, ablation: 0 },
        rLeg: { location: [7, 8], stoppingPower: 14, ablation: 0 },
        lLeg: { location: [9, 10], stoppingPower: 14, ablation: 1 },
      },
      sdp: {
        sum: { Head: 0, Torso: 0, rArm: 25, lArm: 0, rLeg: 0, lLeg: 0 },
        current: { Head: 0, Torso: 0, rArm: 20, lArm: 0, rLeg: 0, lLeg: 0 },
      },
      eurobucks: 2500,
      items: [
        {
          id: 'weapon-1',
          name: 'Malorian Arms 3516',
          type: 'weapon',
          flavor: 'Custom heavy pistol with silver finish',
          notes: "Johnny's signature piece",
          cost: 1500,
          weight: 2,
          equipped: true,
          source: 'Custom',
          weaponType: 'Pistol',
          accuracy: 2,
          concealability: 'J',
          availability: 'R',
          ammoType: '12mm',
          damage: '4d6+1',
          ap: true,
          shotsLeft: 8,
          shots: 10,
          rof: 2,
          reliability: 'VR',
          range: 50,
          attackType: 'Auto',
          attackSkill: 'Handgun',
          isAutoCapable: true,
        } as Weapon,
        {
          id: 'weapon-2',
          name: 'Kendachi Mono-katana',
          type: 'weapon',
          flavor: 'Mono-edged katana, cuts through anything',
          notes: '',
          cost: 600,
          weight: 1,
          equipped: true,
          source: 'Core',
          weaponType: 'Melee',
          accuracy: 1,
          concealability: 'N',
          availability: 'P',
          ammoType: '',
          damage: '4d6',
          ap: false,
          shotsLeft: 0,
          shots: 0,
          rof: 1,
          reliability: 'VR',
          range: 1,
          attackType: 'Mono',
          attackSkill: 'Melee',
          isAutoCapable: false,
        } as Weapon,
        {
          id: 'armor-1',
          name: 'Light Armor Jacket',
          type: 'armor',
          flavor: 'Standard street protection',
          notes: '',
          cost: 150,
          weight: 2,
          equipped: true,
          source: 'Core',
          coverage: {
            Torso: { stoppingPower: 14, ablation: 0 },
            rArm: { stoppingPower: 14, ablation: 0 },
            lArm: { stoppingPower: 14, ablation: 0 },
          },
          encumbrance: 0,
        } as Armor,
        {
          id: 'armor-2',
          name: 'Steel Helmet',
          type: 'armor',
          flavor: 'Military surplus head protection',
          notes: '',
          cost: 100,
          weight: 1,
          equipped: true,
          source: 'Core',
          coverage: {
            Head: { stoppingPower: 14, ablation: 0 },
          },
          encumbrance: 0,
        } as Armor,
        {
          id: 'cyber-1',
          name: 'Cyberoptic (Left)',
          type: 'cyberware',
          flavor: 'Enhanced vision system with IR overlay',
          notes: 'Includes Times Square Marquee and Targeting Scope',
          cost: 500,
          weight: 0,
          equipped: true,
          source: 'Core',
          surgCode: 'MA',
          humanityCost: '2d6',
          humanityLoss: 7,
          cyberwareType: 'Optics',
        } as Cyberware,
        {
          id: 'cyber-2',
          name: 'Cyberarm (Right)',
          type: 'cyberware',
          flavor: 'Chrome arm with built-in tool hand',
          notes: 'SDP 25',
          cost: 2000,
          weight: 0,
          equipped: true,
          source: 'Core',
          surgCode: 'CR',
          humanityCost: '2d6+2',
          humanityLoss: 9,
          cyberwareType: 'Arms',
        } as Cyberware,
      ],
      combatModifiers: { initiative: 0, stunSave: 0 },
      netrunDeck: null,
      lifepath: {
        style: {
          clothes: 'Leathers',
          hair: 'Wild & spiked',
          affectations: 'Mirrorshades, dog tags',
        },
        ethnicity: 'Anglo-American',
        language: 'English',
        familyBackground: 'Street kid, parents killed in Corporate raid on the Combat Zone',
        siblings: '1 sister (missing)',
        motivations: {
          traits: 'Rebellious, loyal to friends, hates authority',
          valuedPerson: 'Alt Cunningham',
          valueMost: 'Freedom',
          feelAboutPeople: 'People are worth fighting for',
          valuedPossession: 'His guitar',
        },
        lifeEvents: [
          { age: 17, event: 'Formed first band "Samurai" with Kerry Eurodyne' },
          { age: 19, event: 'First gig at the Rainbow Cadenza, crowd of 200' },
          { age: 22, event: 'Samurai goes big — signed with Universal Music' },
          { age: 25, event: 'Publicly defied Arasaka Corp on live broadcast' },
          { age: 28, event: 'Romance with netrunner Alt Cunningham begins' },
          { age: 30, event: 'Alt kidnapped by Arasaka. Failed rescue attempt.' },
        ],
        notes: 'The voice of a generation. Still fighting the good fight.',
      },
    };

    addCharacter(demoCharacter);
  }, [addCharacter, characters.allIds.length, sessionId]);

  const signIn = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    if (error) setAuthError(error.message);
  };

  const sheetId = resolvedCharacterId;

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-bold text-cyan-400 uppercase tracking-wider">
            Cyberpunk 2020 — Character Sheet
          </h1>
          <div className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-500 hover:text-cyan-400 underline">
              Home
            </Link>
            <Link href="/realtime-test" className="text-zinc-500 hover:text-violet-400 underline">
              Realtime test
            </Link>
          </div>
        </div>

        {sessionId && (
          <div className="rounded border border-zinc-700 bg-zinc-900/80 p-4 text-sm text-zinc-300 space-y-3">
            <p>
              <span className="text-cyan-500">Cloud session</span> · Session ID:{' '}
              <code className="text-amber-200/90">{sessionId}</code>
            </p>
            <p className="text-zinc-500 text-xs">
              Add <code className="text-zinc-400">?session=UUID</code> and optional{' '}
              <code className="text-zinc-400">?character=UUID</code>. Sign in with the same account that owns the
              character (RLS). Edits debounce-save to Postgres; other clients get updates via Realtime.
            </p>
            {!user ? (
              <div className="flex flex-wrap gap-2 items-end">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">Email</span>
                  <input
                    className="bg-zinc-950 border border-zinc-600 rounded px-2 py-1 text-white"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">Password</span>
                  <input
                    type="password"
                    className="bg-zinc-950 border border-zinc-600 rounded px-2 py-1 text-white"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void signIn()}
                  className="bg-cyan-800 hover:bg-cyan-700 text-white px-3 py-1.5 rounded"
                >
                  Sign in
                </button>
                {authError && <span className="text-red-400 text-xs">{authError}</span>}
              </div>
            ) : (
              <p className="text-emerald-400 text-xs">
                Signed in as {user.email ?? user.id}
                {syncHint && <span className="text-zinc-400"> — {syncHint}</span>}
              </p>
            )}
          </div>
        )}

        {sessionId && user && !cloudHydrated && (
          <div className="text-center text-zinc-400 py-6 text-sm">Loading session from Supabase…</div>
        )}

        {sessionId && user && cloudHydrated && !sheetId && (
          <div className="text-center text-amber-400 py-6">
            {characterParam && !characters.byId[characterParam]
              ? `Character ${characterParam} not found in this session.`
              : 'No character loaded for this session. Create one (e.g. from Realtime test) or pass ?character=UUID.'}
          </div>
        )}

        {sheetId ? (
          <>
            <CharacterSheet characterId={sheetId} editable={true} />
            <DiceRoller />
          </>
        ) : !sessionId ? (
          characters.allIds.length === 0 ? (
            <div className="text-center text-gray-400 py-8">Loading character…</div>
          ) : null
        ) : null}
      </div>
    </div>
  );
}
