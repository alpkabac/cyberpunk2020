'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ALL_ROLES,
  CP2020_CINEMATIC_PRESETS,
  CP2020_PICKUP_POOL,
  CP2020_STAT_KEYS,
  type Cp2020CinematicPreset,
  type Cp2020PointMethod,
  ROLE_CAREER_PACKAGES,
  allocateStatsFromCharacterPoints,
  buildCp2020CharacterFromChargen,
  createCryptoRng,
  distributeCareerSkills,
  distributePickupSkills,
  monthlySalaryEb,
  resolveCharacterPoints,
  rollD6,
  rollStartingEurobucks,
  validateCp2020Chargen,
} from '@/lib/character-gen/cp2020-char-gen';
import {
  rollChargenStartingGear,
  type ChargenStartingGearResult,
} from '@/lib/character-gen/cp2020-chargen-starting-gear';
import {
  rollLifepathAgeFromBook,
  rollLifepathEthnicityFromBook,
  rollLifepathFamilyAndSiblingsFromBook,
  rollLifepathLifeEventsFromBook,
  rollLifepathMotivationsFromBook,
  rollLifepathSections1to3FromBook,
  rollLifepathStyleFromBook,
} from '@/lib/character-gen/cp2020-lifepath-rolls';
import { serializeCharacterForDb } from '@/lib/db/character-serialize';
import {
  EMPTY_LIFEPATH,
  LIFEPATH_AFFECTATIONS,
  LIFEPATH_CHILDHOOD,
  LIFEPATH_CLOTHES,
  LIFEPATH_ETHNICITY,
  LIFEPATH_FAMILY_RANKING,
  LIFEPATH_FEEL_ABOUT_PEOPLE,
  LIFEPATH_HAIR,
  LIFEPATH_LANGUAGE,
  LIFEPATH_SIBLINGS_PRESET,
  LIFEPATH_TRAITS,
  LIFEPATH_VALUED_PERSON,
  LIFEPATH_VALUED_POSSESSION,
  LIFEPATH_VALUE_MOST,
} from '@/lib/data/lifepath-options';
import type { CharacterItem, Lifepath, RoleType, Stats } from '@/lib/types';
import { ROLE_SPECIAL_ABILITIES } from '@/lib/types';

const STEPS = ['Profile', 'Stats', 'Career', 'Pickup', 'Life', 'Gear', 'Funds', 'Review'] as const;

function WizardTip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-md border border-cyan-900/35 bg-cyan-950/15 px-3 py-2.5 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-cyan-500/95">{title}</p>
      <div className="text-[11px] text-zinc-400 leading-relaxed space-y-2">{children}</div>
    </aside>
  );
}

type Draft = {
  name: string;
  role: RoleType;
  age: number;
  method: Cp2020PointMethod;
  cinematicPreset: Cp2020CinematicPreset;
  points: number;
  statBases: Record<keyof Stats, number>;
  careerValues: Record<string, number>;
  pickup: { name: string; value: number }[];
  lifepath: Lifepath;
  startingItems: CharacterItem[];
  /** Last armor/weapon table roll (p.30); same D10+mod picks both armor and weapon row. */
  gearTableRoll: ChargenStartingGearResult['armorWeaponTable'];
  eurobucks: number;
};

function itemTypeLabel(t: CharacterItem['type']): string {
  switch (t) {
    case 'armor':
      return 'Armor';
    case 'weapon':
      return 'Weapon';
    case 'cyberware':
      return 'Cyberware';
    case 'vehicle':
      return 'Vehicle';
    case 'program':
      return 'Program';
    case 'misc':
      return 'Gear';
    default:
      return t;
  }
}

function freshLifepath(): Lifepath {
  return {
    ...EMPTY_LIFEPATH,
    style: { ...EMPTY_LIFEPATH.style },
    motivations: { ...EMPTY_LIFEPATH.motivations },
    lifeEvents: [],
  };
}

function basesFromAllocated(stats: Stats): Record<keyof Stats, number> {
  const o = {} as Record<keyof Stats, number>;
  for (const k of CP2020_STAT_KEYS) o[k] = stats[k].base;
  return o;
}

function rollFreshDraft(suggestedName: string): Draft {
  const rng = createCryptoRng();
  const role: RoleType = 'Solo';
  const method: Cp2020PointMethod = 'cinematic';
  const cinematicPreset: Cp2020CinematicPreset = 'average';
  const points = resolveCharacterPoints(method, rng, cinematicPreset);
  const statBases = basesFromAllocated(allocateStatsFromCharacterPoints(points, rng));
  const { skills: career } = distributeCareerSkills(role, rng);
  const careerValues = Object.fromEntries(career.map((s) => [s.name, s.value]));
  const careerNames = new Set(career.map((s) => s.name));
  const pickupSkills = distributePickupSkills(careerNames, statBases.ref, statBases.int, rng);
  const pickup = pickupSkills.map((s) => ({ name: s.name, value: s.value }));
  const spec = career.find((s) => s.isSpecialAbility)?.value ?? 1;
  const gear = rollChargenStartingGear(role, rng);
  return {
    name: suggestedName.trim() || 'New runner',
    role,
    age: 20 + rollD6(rng) + rollD6(rng),
    method,
    cinematicPreset,
    points,
    statBases,
    careerValues,
    pickup,
    lifepath: freshLifepath(),
    startingItems: gear.items,
    gearTableRoll: gear.armorWeaponTable,
    eurobucks: rollStartingEurobucks(role, spec, rng),
  };
}

function careerTotal(role: RoleType, careerValues: Record<string, number>): number {
  const pack = ROLE_CAREER_PACKAGES[role];
  return pack.reduce((a, n) => a + (careerValues[n] ?? 0), 0);
}

function pickupSpent(pickup: { name: string; value: number }[]): number {
  return pickup.reduce((a, p) => a + p.value, 0);
}

export type ChargenWizardProps = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  userId: string;
  defaultName: string;
  supabase: SupabaseClient;
  onCreated?: (characterId: string) => void;
};

export function ChargenWizard({
  open,
  onClose,
  sessionId,
  userId,
  defaultName,
  supabase,
  onCreated,
}: ChargenWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDraft(rollFreshDraft(defaultName));
    setError(null);
    setBusy(false);
  }, [open, defaultName]);

  const careerNames = useMemo(() => {
    if (!draft) return new Set<string>();
    return new Set(ROLE_CAREER_PACKAGES[draft.role]);
  }, [draft]);

  const pickupPool = draft ? draft.statBases.ref + draft.statBases.int : 0;
  const spentPickup = draft ? pickupSpent(draft.pickup) : 0;
  const statSum = draft
    ? CP2020_STAT_KEYS.reduce((a, k) => a + draft.statBases[k], 0)
    : 0;
  const c40 = draft ? careerTotal(draft.role, draft.careerValues) : 0;
  const specialName = draft ? ROLE_SPECIAL_ABILITIES[draft.role] : '';

  const rollPointsAndStats = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const rng = createCryptoRng();
      const points = resolveCharacterPoints(
        d.method,
        rng,
        d.method === 'cinematic' ? d.cinematicPreset : undefined,
      );
      const statBases = basesFromAllocated(allocateStatsFromCharacterPoints(points, rng));
      const careerNamesInner = new Set(ROLE_CAREER_PACKAGES[d.role]);
      const pickupSkills = distributePickupSkills(careerNamesInner, statBases.ref, statBases.int, rng);
      const spec = d.careerValues[ROLE_SPECIAL_ABILITIES[d.role]] ?? 1;
      return {
        ...d,
        points,
        statBases,
        pickup: pickupSkills.map((s) => ({ name: s.name, value: s.value })),
        eurobucks: rollStartingEurobucks(d.role, spec, rng),
      };
    });
  }, []);

  const rerollCareer = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const rng = createCryptoRng();
      const { skills } = distributeCareerSkills(d.role, rng);
      const careerValues = Object.fromEntries(skills.map((s) => [s.name, s.value]));
      const spec = skills.find((s) => s.isSpecialAbility)?.value ?? 1;
      return {
        ...d,
        careerValues,
        eurobucks: rollStartingEurobucks(d.role, spec, rng),
      };
    });
  }, []);

  const rerollPickup = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const rng = createCryptoRng();
      const names = new Set(ROLE_CAREER_PACKAGES[d.role]);
      const pickupSkills = distributePickupSkills(names, d.statBases.ref, d.statBases.int, rng);
      return { ...d, pickup: pickupSkills.map((s) => ({ name: s.name, value: s.value })) };
    });
  }, []);

  const rollFunds = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const rng = createCryptoRng();
      const spec = d.careerValues[ROLE_SPECIAL_ABILITIES[d.role]] ?? 1;
      return { ...d, eurobucks: rollStartingEurobucks(d.role, spec, rng) };
    });
  }, []);

  const rollStartingGear = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const rng = createCryptoRng();
      const gear = rollChargenStartingGear(d.role, rng);
      return { ...d, startingItems: gear.items, gearTableRoll: gear.armorWeaponTable };
    });
  }, []);

  const changeRole = useCallback((role: RoleType) => {
    const rng = createCryptoRng();
    const { skills } = distributeCareerSkills(role, rng);
    const careerValues = Object.fromEntries(skills.map((s) => [s.name, s.value]));
    const careerSet = new Set(skills.map((s) => s.name));
    const gear = rollChargenStartingGear(role, rng);
    setDraft((d) => {
      if (!d) return d;
      const pickup = d.pickup.filter((p) => !careerSet.has(p.name));
      const spec = careerValues[ROLE_SPECIAL_ABILITIES[role]] ?? 1;
      return {
        ...d,
        role,
        careerValues,
        pickup,
        startingItems: gear.items,
        gearTableRoll: gear.armorWeaponTable,
        eurobucks: rollStartingEurobucks(role, spec, rng),
      };
    });
  }, []);

  const reviewPayload = useMemo((): Parameters<typeof validateCp2020Chargen>[0] | null => {
    if (!draft) return null;
    return {
      sessionId,
      userId,
      name: draft.name.trim(),
      role: draft.role,
      age: Math.max(16, Math.min(99, Math.floor(draft.age))),
      points: draft.points,
      statBases: draft.statBases,
      careerValuesByName: draft.careerValues,
      pickup: draft.pickup.filter((p) => p.value > 0),
      eurobucks: draft.eurobucks,
      lifepath: draft.lifepath,
      items: draft.startingItems,
    };
  }, [draft, sessionId, userId]);

  const reviewErrors = useMemo(
    () => (reviewPayload ? validateCp2020Chargen(reviewPayload) : []),
    [reviewPayload],
  );

  const canNext = useMemo(() => {
    if (!draft) return false;
    if (step === 0) return draft.name.trim().length > 0;
    if (step === 1) return statSum === draft.points;
    if (step === 2) {
      const sp = draft.careerValues[specialName] ?? 0;
      return c40 === 40 && sp >= 1 && sp <= 10;
    }
    if (step === 3) return spentPickup <= pickupPool;
    if (step === 4) return true;
    if (step === 5) return true;
    if (step === 6) return draft.eurobucks >= 0;
    if (step === 7) return reviewErrors.length === 0;
    return true;
  }, [draft, step, statSum, c40, specialName, spentPickup, pickupPool, reviewErrors.length]);

  const goNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  };
  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const submit = async () => {
    if (!reviewPayload) return;
    const v = validateCp2020Chargen(reviewPayload);
    if (v.length > 0) {
      setError(v.join(' '));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = buildCp2020CharacterFromChargen(reviewPayload);
      const { data, error: insErr } = await supabase
        .from('characters')
        .insert({
          session_id: sessionId,
          user_id: userId,
          type: 'character',
          ...serializeCharacterForDb({ ...c, name: reviewPayload.name }),
        })
        .select('id')
        .single();
      if (insErr) {
        setError(insErr.message);
        return;
      }
      if (data?.id) onCreated?.(data.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open || !draft) return null;

  const salary = monthlySalaryEb(draft.role, draft.careerValues[specialName] ?? 1);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-[2px]">
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col rounded-lg border border-violet-800/50 bg-zinc-950 shadow-2xl shadow-violet-950/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chargen-title"
      >
        <header className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="chargen-title" className="text-sm font-bold uppercase tracking-wider text-violet-300">
              New character
            </h2>
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
              View from the Edge flow: stats & skills, Lifepath, starting gear (p.30 tables), then occupation-table cash
              (p.58). Totals are validated before save.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="shrink-0 px-4 py-2 border-b border-zinc-800/80 flex gap-1 overflow-x-auto">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={`shrink-0 text-[9px] uppercase tracking-wide px-2 py-1 rounded border ${
                i === step
                  ? 'border-cyan-600 bg-cyan-950/50 text-cyan-200'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-zinc-200 space-y-4">
          {error && (
            <p className="text-xs text-red-400 border border-red-900/40 rounded p-2 bg-red-950/25">{error}</p>
          )}

          {step === 0 && (
            <div className="space-y-3">
              <WizardTip title="How this wizard maps to CP2020">
                <p>
                  Each step mirrors the core book flow: you establish who the character is, turn Character Points into
                  stats, assign the mandatory career skills for that role, optionally add a few pickup skills, and finish
                  with money. Totals are validated so the sheet matches what combat, skills, and the database expect.
                </p>
                <p>
                  Your <span className="text-zinc-300">role</span> is important because it locks in the{' '}
                  <span className="text-zinc-300">exact list</span> of career skills (see the Career step)—you are not
                  building a free-form skill list at chargen, only distributing points within that list.
                </p>
              </WizardTip>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-zinc-500">Name</span>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-zinc-500">Role</span>
                <select
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
                  value={draft.role}
                  onChange={(e) => changeRole(e.target.value as RoleType)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-zinc-500">Age</span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={16}
                    max={99}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
                    value={draft.age}
                    onChange={(e) =>
                      setDraft({ ...draft, age: Number.parseInt(e.target.value, 10) || 16 })
                    }
                  />
                  <button
                    type="button"
                    className="text-[10px] uppercase px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-900"
                    onClick={() => {
                      const rng = createCryptoRng();
                      setDraft({ ...draft, age: 20 + rollD6(rng) + rollD6(rng) });
                    }}
                  >
                    Roll 20+2D6
                  </button>
                </div>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <WizardTip title="Character Points and stats">
                <p>
                  <span className="text-zinc-300">Random</span> totals nine ten-sided dice.{' '}
                  <span className="text-zinc-300">Fast</span> rolls nine dice but re-rolls any result of 2 or lower, then
                  sums them—usually a slightly higher spread. <span className="text-zinc-300">Cinematic</span> uses a
                  referee-chosen budget from the preset table when you want a stable campaign power level.
                </p>
                <p>
                  Those points are then split across the nine characteristics. Each stat must stay between{' '}
                  <span className="text-zinc-300">2 and 10</span>, and the nine bases must{' '}
                  <span className="text-zinc-300">add up exactly</span> to your Character Points total. Use the roll
                  button for a legal random split, then tweak with the +/- buttons if your table allows adjustments.
                </p>
              </WizardTip>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="space-y-1">
                  <span className="text-[10px] uppercase text-zinc-500">Point method</span>
                  <select
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
                    value={draft.method}
                    onChange={(e) => {
                      const method = e.target.value as Cp2020PointMethod;
                      setDraft((d) => (d ? { ...d, method } : d));
                    }}
                  >
                    <option value="random">Random (9D10 sum)</option>
                    <option value="fast">Fast (9D10, reroll ≤2)</option>
                    <option value="cinematic">Cinematic (ref budget)</option>
                  </select>
                </label>
                {draft.method === 'cinematic' && (
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase text-zinc-500">Preset</span>
                    <select
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
                      value={draft.cinematicPreset}
                      onChange={(e) => {
                        const cinematicPreset = e.target.value as Cp2020CinematicPreset;
                        setDraft((d) => {
                          if (!d) return d;
                          const rng = createCryptoRng();
                          const points = resolveCharacterPoints('cinematic', rng, cinematicPreset);
                          const statBases = basesFromAllocated(allocateStatsFromCharacterPoints(points, rng));
                          const names = new Set(ROLE_CAREER_PACKAGES[d.role]);
                          const pickupSkills = distributePickupSkills(names, statBases.ref, statBases.int, rng);
                          const spec = d.careerValues[ROLE_SPECIAL_ABILITIES[d.role]] ?? 1;
                          return {
                            ...d,
                            cinematicPreset,
                            points,
                            statBases,
                            pickup: pickupSkills.map((s) => ({ name: s.name, value: s.value })),
                            eurobucks: rollStartingEurobucks(d.role, spec, rng),
                          };
                        });
                      }}
                    >
                      {(Object.keys(CP2020_CINEMATIC_PRESETS) as Cp2020CinematicPreset[]).map((k) => (
                        <option key={k} value={k}>
                          {k.replace(/_/g, ' ')} ({CP2020_CINEMATIC_PRESETS[k]} pts)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Character Points: <span className="text-amber-200 font-mono">{draft.points}</span>
                {statSum !== draft.points && (
                  <span className="text-amber-500 ml-2">
                    · Stat sum {statSum} (must match points — adjust stats or re-roll)
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={rollPointsAndStats}
                className="w-full text-[11px] uppercase py-2 rounded border border-violet-700/60 text-violet-200 hover:bg-violet-950/40"
              >
                Roll points & random split
              </button>
              <div className="grid grid-cols-2 gap-2">
                {CP2020_STAT_KEYS.map((k) => (
                  <div key={k} className="flex items-center justify-between gap-2 bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1">
                    <span className="text-[10px] uppercase text-zinc-500 w-8">{k}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="w-7 h-7 rounded bg-zinc-800 text-zinc-300 disabled:opacity-30"
                        disabled={draft.statBases[k] <= 2}
                        onClick={() =>
                          setDraft((d) =>
                            d ? { ...d, statBases: { ...d.statBases, [k]: d.statBases[k] - 1 } } : d,
                          )
                        }
                      >
                        −
                      </button>
                      <span className="font-mono w-6 text-center">{draft.statBases[k]}</span>
                      <button
                        type="button"
                        className="w-7 h-7 rounded bg-zinc-800 text-zinc-300 disabled:opacity-30"
                        disabled={draft.statBases[k] >= 10}
                        onClick={() =>
                          setDraft((d) =>
                            d ? { ...d, statBases: { ...d.statBases, [k]: d.statBases[k] + 1 } } : d,
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <WizardTip title="Why the career skill list is fixed">
                <p>
                  In Cyberpunk 2020, each role ships with a defined <span className="text-zinc-300">career skill package</span>
                  : ten entries—your special ability plus nine trained skills. At character creation you receive{' '}
                  <span className="text-zinc-300">40 skill points</span> to divide among those ten lines only. You do not
                  pick substitute skills for that package during chargen; that is how the rules keep roles readable and
                  balanced (a Solo&apos;s package differs from a Media&apos;s, and so on).
                </p>
                <p>
                  The <span className="text-zinc-300">special ability</span> line must stay between 1 and 10. The other
                  career lines can range from 0 to 10. The ten values must total exactly 40. Anything else you want
                  belongs in <span className="text-zinc-300">pickup skills</span> (next step) or is bought later with
                  Improvement Points during play.
                </p>
              </WizardTip>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400">
                  Career total{' '}
                  <span className={c40 === 40 ? 'text-emerald-400' : 'text-amber-400'}>{c40}</span> / 40
                </span>
                <button
                  type="button"
                  onClick={rerollCareer}
                  className="text-[10px] uppercase text-violet-300 border border-violet-800/60 rounded px-2 py-0.5 hover:bg-violet-950/30"
                >
                  Random 40 pt spread
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">
                Special: <span className="text-zinc-300">{specialName}</span> (1–10). Other career skills 0–10.
              </p>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {ROLE_CAREER_PACKAGES[draft.role].map((name) => {
                  const isSp = name === specialName;
                  const v = draft.careerValues[name] ?? 0;
                  return (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-2 text-[11px] bg-zinc-900/40 border border-zinc-800/80 rounded px-2 py-1"
                    >
                      <span className="truncate flex-1" title={name}>
                        {name}
                        {isSp && <span className="text-violet-400 ml-1">· SA</span>}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="w-6 h-6 rounded bg-zinc-800 text-xs disabled:opacity-30"
                          disabled={isSp ? v <= 1 : v <= 0}
                          onClick={() =>
                            setDraft((d) => {
                              if (!d) return d;
                              const next = { ...d.careerValues, [name]: v - 1 };
                              return { ...d, careerValues: next };
                            })
                          }
                        >
                          −
                        </button>
                        <span className="font-mono w-5 text-center">{v}</span>
                        <button
                          type="button"
                          className="w-6 h-6 rounded bg-zinc-800 text-xs disabled:opacity-30"
                          disabled={v >= 10}
                          onClick={() =>
                            setDraft((d) => {
                              if (!d) return d;
                              const next = { ...d.careerValues, [name]: v + 1 };
                              return { ...d, careerValues: next };
                            })
                          }
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <WizardTip title="Why pickup skill selection is limited">
                <p>
                  <span className="text-zinc-300">Pickup skills</span> represent extra training outside your career
                  package. The rules give you a number of pickup points equal to{' '}
                  <span className="text-zinc-300">REF + INT</span> (using the stat bases from the Stats step). You may
                  only choose skills that are <span className="text-zinc-300">not already in your career list</span>—the
                  book assumes you are broadening the character, not doubling up on a career skill at chargen.
                </p>
                <p>
                  The dropdown here is limited to the app&apos;s{' '}
                  <span className="text-zinc-300">canonical pickup pool</span> (the same names and stat links used in
                  validation, the digital sheet, and GM tools). That keeps skill categories, defaults, and future IP
                  spends consistent. Skills you do not see are either part of your current role&apos;s career package or
                  outside that pool; your referee can still add unusual skills after creation using Improvement Points or
                  house rules.
                </p>
              </WizardTip>
              <p className="text-xs text-zinc-400">
                Pickup pool (REF + INT):{' '}
                <span className="text-cyan-200 font-mono">{pickupPool}</span>
                <span className="text-zinc-500 ml-2">
                  spent {spentPickup}
                  {spentPickup > pickupPool && (
                    <span className="text-red-400 ml-1">— over budget; lower values or change stats</span>
                  )}
                </span>
              </p>
              <button
                type="button"
                onClick={rerollPickup}
                className="w-full text-[10px] uppercase py-1.5 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-900"
              >
                Suggest pickup spread (book pool)
              </button>
              <div className="space-y-2">
                {draft.pickup.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">No pickup skills yet — add from list below.</p>
                ) : (
                  draft.pickup.map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-2 text-[11px] bg-zinc-900/40 border border-zinc-800 rounded px-2 py-1"
                    >
                      <span className="flex-1 truncate">{p.name}</span>
                      <button
                        type="button"
                        className="text-red-400/80 text-[10px] uppercase px-1"
                        onClick={() =>
                          setDraft((d) => (d ? { ...d, pickup: d.pickup.filter((x) => x.name !== p.name) } : d))
                        }
                      >
                        Remove
                      </button>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="w-6 h-6 rounded bg-zinc-800"
                          disabled={p.value <= 0}
                          onClick={() =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    pickup: d.pickup.map((x) =>
                                      x.name === p.name ? { ...x, value: x.value - 1 } : x,
                                    ),
                                  }
                                : d,
                            )
                          }
                        >
                          −
                        </button>
                        <span className="font-mono w-5 text-center">{p.value}</span>
                        <button
                          type="button"
                          className="w-6 h-6 rounded bg-zinc-800"
                          disabled={p.value >= 10}
                          onClick={() =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    pickup: d.pickup.map((x) =>
                                      x.name === p.name ? { ...x, value: x.value + 1 } : x,
                                    ),
                                  }
                                : d,
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-zinc-500">Add pickup skill</span>
                <select
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs"
                  value=""
                  onChange={(e) => {
                    const name = e.target.value;
                    if (!name) return;
                    e.target.value = '';
                    setDraft((d) => {
                      if (!d) return d;
                      if (d.pickup.some((x) => x.name === name)) return d;
                      if (careerNames.has(name)) return d;
                      return { ...d, pickup: [...d.pickup, { name, value: 1 }] };
                    });
                  }}
                >
                  <option value="">Choose…</option>
                  {CP2020_PICKUP_POOL.filter((n) => !careerNames.has(n) && !draft.pickup.some((x) => x.name === n)).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
              </label>
              {CP2020_PICKUP_POOL.every(
                (n) => careerNames.has(n) || draft.pickup.some((x) => x.name === n),
              ) && (
                <p className="text-[10px] text-zinc-500">
                  Every pickup-pool skill is either already on your sheet or blocked because it appears in your career
                  package for this role. You can leave pickup empty or ask your ref about adding skills later with IP.
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-xs">
              <WizardTip title="Lifepath (View from the Edge pp.34–39)">
                <p>
                  Buttons follow the book: <span className="text-zinc-300">§1</span> dress (3×D10) and ethnic origins
                  (D10); <span className="text-zinc-300">§2</span> family ranking → parents → status/tragedy →
                  childhood → siblings (with sex/age/feeling per sibling); <span className="text-zinc-300">§3</span>{' '}
                  motivations (five D10); <span className="text-zinc-300">§4</span> for each year{' '}
                  <span className="text-zinc-300">after 16</span>, main D10 (wins/romance/friends/nothing) then nested
                  rolls in subsections. Set age first (Profile or <span className="text-zinc-300">2D6+16</span> here),
                  then roll life events through that age.
                </p>
              </WizardTip>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-violet-800/60 text-violet-200 hover:bg-violet-950/30"
                  onClick={() => {
                    const rng = createCryptoRng();
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            lifepath: { ...d.lifepath, style: rollLifepathStyleFromBook(rng) },
                          }
                        : d,
                    );
                  }}
                >
                  §1 Roll style (3×D10)
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-violet-800/60 text-violet-200 hover:bg-violet-950/30"
                  onClick={() => {
                    const rng = createCryptoRng();
                    setDraft((d) => {
                      if (!d) return d;
                      const { ethnicity, language } = rollLifepathEthnicityFromBook(rng);
                      return { ...d, lifepath: { ...d.lifepath, ethnicity, language } };
                    });
                  }}
                >
                  §1 Roll ethnic origins
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-amber-800/50 text-amber-200 hover:bg-amber-950/25"
                  onClick={() => {
                    const rng = createCryptoRng();
                    setDraft((d) => {
                      if (!d) return d;
                      const { familyBackground, siblings } = rollLifepathFamilyAndSiblingsFromBook(rng);
                      return { ...d, lifepath: { ...d.lifepath, familyBackground, siblings } };
                    });
                  }}
                >
                  §2 Family + siblings
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-emerald-800/50 text-emerald-200 hover:bg-emerald-950/20"
                  onClick={() => {
                    const rng = createCryptoRng();
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            lifepath: { ...d.lifepath, motivations: rollLifepathMotivationsFromBook(rng) },
                          }
                        : d,
                    );
                  }}
                >
                  §3 Motivations (5×D10)
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-cyan-800/50 text-cyan-200 hover:bg-cyan-950/25"
                  onClick={() => {
                    const rng = createCryptoRng();
                    setDraft((d) => {
                      if (!d) return d;
                      const block = rollLifepathSections1to3FromBook(rng);
                      return {
                        ...d,
                        lifepath: {
                          ...d.lifepath,
                          style: block.style,
                          ethnicity: block.ethnicity,
                          language: block.language,
                          familyBackground: block.familyBackground,
                          siblings: block.siblings,
                          motivations: block.motivations,
                        },
                      };
                    });
                  }}
                >
                  §1–3 All at once
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-900"
                  onClick={() => {
                    const rng = createCryptoRng();
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            age: rollLifepathAgeFromBook(rng),
                          }
                        : d,
                    );
                  }}
                >
                  Age = 2D6+16
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-rose-800/50 text-rose-200 hover:bg-rose-950/20 col-span-2 sm:col-span-3"
                  onClick={() => {
                    const rng = createCryptoRng();
                    setDraft((d) => {
                      if (!d) return d;
                      const lifeEvents = rollLifepathLifeEventsFromBook(d.age, rng);
                      return { ...d, lifepath: { ...d.lifepath, lifeEvents } };
                    });
                  }}
                >
                  §4 Roll life events (age 17 → {draft.age})
                </button>
                <button
                  type="button"
                  className="text-[10px] uppercase px-2 py-1.5 rounded border border-zinc-700 text-zinc-500 hover:bg-zinc-900 col-span-2 sm:col-span-3"
                  onClick={() =>
                    setDraft((d) =>
                      d ? { ...d, lifepath: { ...d.lifepath, lifeEvents: [] } } : d,
                    )
                  }
                >
                  Clear life events
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Clothes</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.style.clothes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          style: { ...draft.lifepath.style, clothes: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_CLOTHES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Hair</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.style.hair}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          style: { ...draft.lifepath.style, hair: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_HAIR.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Affectations</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.style.affectations}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          style: { ...draft.lifepath.style, affectations: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_AFFECTATIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Ethnicity / origin</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.ethnicity}
                    onChange={(e) =>
                      setDraft({ ...draft, lifepath: { ...draft.lifepath, ethnicity: e.target.value } })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_ETHNICITY.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Language</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.language}
                    onChange={(e) =>
                      setDraft({ ...draft, lifepath: { ...draft.lifepath, language: e.target.value } })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_LANGUAGE.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-0.5">
                    <span className="text-[10px] uppercase text-zinc-500">Family ranking</span>
                    <select
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px]"
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        e.target.value = '';
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                lifepath: {
                                  ...d.lifepath,
                                  familyBackground: v,
                                },
                              }
                            : d,
                        );
                      }}
                    >
                      <option value="">Insert preset…</option>
                      {LIFEPATH_FAMILY_RANKING.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] uppercase text-zinc-500">Childhood env.</span>
                    <select
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px]"
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        e.target.value = '';
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                lifepath: {
                                  ...d.lifepath,
                                  familyBackground: d.lifepath.familyBackground
                                    ? `${d.lifepath.familyBackground}; ${v}`
                                    : v,
                                },
                              }
                            : d,
                        );
                      }}
                    >
                      <option value="">Append preset…</option>
                      {LIFEPATH_CHILDHOOD.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Family & childhood (free text)</span>
                  <textarea
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 min-h-[52px]"
                    value={draft.lifepath.familyBackground}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: { ...draft.lifepath, familyBackground: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Siblings</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={
                      LIFEPATH_SIBLINGS_PRESET.includes(draft.lifepath.siblings as (typeof LIFEPATH_SIBLINGS_PRESET)[number])
                        ? draft.lifepath.siblings
                        : '__custom__'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          siblings: v === '__custom__' ? '' : v,
                        },
                      });
                    }}
                  >
                    <option value="">—</option>
                    {LIFEPATH_SIBLINGS_PRESET.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                    <option value="__custom__">Custom (edit below)</option>
                  </select>
                  <input
                    className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    placeholder="Custom siblings note"
                    value={
                      LIFEPATH_SIBLINGS_PRESET.includes(
                        draft.lifepath.siblings as (typeof LIFEPATH_SIBLINGS_PRESET)[number],
                      )
                        ? ''
                        : draft.lifepath.siblings
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: { ...draft.lifepath, siblings: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Personality traits</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.motivations.traits}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          motivations: { ...draft.lifepath.motivations, traits: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_TRAITS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Valued person</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.motivations.valuedPerson}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          motivations: { ...draft.lifepath.motivations, valuedPerson: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_VALUED_PERSON.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Value most</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.motivations.valueMost}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          motivations: { ...draft.lifepath.motivations, valueMost: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_VALUE_MOST.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Feel about people</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.motivations.feelAboutPeople}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          motivations: { ...draft.lifepath.motivations, feelAboutPeople: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_FEEL_ABOUT_PEOPLE.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">Valued possession</span>
                  <select
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={draft.lifepath.motivations.valuedPossession}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lifepath: {
                          ...draft.lifepath,
                          motivations: { ...draft.lifepath.motivations, valuedPossession: e.target.value },
                        },
                      })
                    }
                  >
                    <option value="">—</option>
                    {LIFEPATH_VALUED_POSSESSION.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase text-zinc-500">Life events (optional)</span>
                  <button
                    type="button"
                    className="text-[10px] uppercase text-cyan-600 hover:text-cyan-400"
                    onClick={() =>
                      setDraft((d) => {
                        if (!d) return d;
                        const ev = d.lifepath.lifeEvents;
                        const nextAge =
                          ev.length > 0 ? Math.max(...ev.map((e) => e.age)) + 1 : Math.max(17, Math.min(d.age, 99));
                        return {
                          ...d,
                          lifepath: {
                            ...d.lifepath,
                            lifeEvents: [...ev, { age: nextAge, event: '' }],
                          },
                        };
                      })
                    }
                  >
                    + Add row
                  </button>
                </div>
                {draft.lifepath.lifeEvents.length === 0 ? (
                  <p className="text-[10px] text-zinc-600">No events — fine for a quick chargen.</p>
                ) : (
                  <ul className="space-y-1 max-h-36 overflow-y-auto">
                    {draft.lifepath.lifeEvents.map((ev, index) => (
                      <li key={index} className="flex gap-1 items-center">
                        <input
                          type="number"
                          min={16}
                          max={99}
                          className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 font-mono text-[11px]"
                          value={ev.age}
                          onChange={(e) => {
                            const age = Number.parseInt(e.target.value, 10) || 16;
                            setDraft((d) => {
                              if (!d) return d;
                              const copy = [...d.lifepath.lifeEvents];
                              copy[index] = { ...copy[index]!, age };
                              return { ...d, lifepath: { ...d.lifepath, lifeEvents: copy } };
                            });
                          }}
                        />
                        <input
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[11px]"
                          value={ev.event}
                          placeholder="What happened?"
                          onChange={(e) => {
                            const event = e.target.value;
                            setDraft((d) => {
                              if (!d) return d;
                              const copy = [...d.lifepath.lifeEvents];
                              copy[index] = { ...copy[index]!, event };
                              return { ...d, lifepath: { ...d.lifepath, lifeEvents: copy } };
                            });
                          }}
                        />
                        <button
                          type="button"
                          className="text-red-400/90 text-[10px] uppercase shrink-0"
                          onClick={() =>
                            setDraft((d) => {
                              if (!d) return d;
                              return {
                                ...d,
                                lifepath: {
                                  ...d.lifepath,
                                  lifeEvents: d.lifepath.lifeEvents.filter((_, i) => i !== index),
                                },
                              };
                            })
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <label className="space-y-0.5 block">
                <span className="text-[10px] uppercase text-zinc-500">Notes</span>
                <textarea
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 min-h-[48px]"
                  value={draft.lifepath.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, lifepath: { ...draft.lifepath, notes: e.target.value } })
                  }
                />
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 text-xs">
              <WizardTip title="Starting armor, weapon & cyber">
                <p>
                  Uses the <span className="text-zinc-300">Fast Character System</span> tables (core book p.30):{' '}
                  <span className="text-zinc-300">1D10 + role modifier</span> for armor and matching weapon row, plus{' '}
                  <span className="text-zinc-300">1D10</span> cyber picks — Solos get six rolls, everyone else three, with
                  duplicate results re-rolled. Subsystems (optics, cyberarm gun, audio) use the book&apos;s D6 charts.
                </p>
                <p>
                  <span className="text-zinc-300">Role modifier</span> is not a bug:{' '}
                  <span className="text-zinc-300">Solo +3</span>, <span className="text-zinc-300">Cop & Nomad +2</span>,{' '}
                  other roles <span className="text-zinc-300">+0</span>. The total is capped 1–10, so a Solo{' '}
                  <span className="text-zinc-300">never</span> uses rows 1–3 (no Knife / Heavy Leather on a natural 1 — minimum
                  row is 4). Netrunner, Techie, Media, etc. can roll the full table.
                </p>
              </WizardTip>
              {draft.gearTableRoll && (
                <p className="text-[11px] text-amber-200/95 font-mono bg-amber-950/20 border border-amber-900/40 rounded px-2 py-1.5">
                  Armor/weapon row: D10={draft.gearTableRoll.d10} + {draft.gearTableRoll.modifier} ({draft.role}) →{' '}
                  <span className="text-amber-100">table {draft.gearTableRoll.tableIndex}</span>
                </p>
              )}
              <button
                type="button"
                onClick={rollStartingGear}
                className="w-full text-[10px] uppercase py-2 rounded border border-amber-800/60 text-amber-200 hover:bg-amber-950/25"
              >
                Roll / re-roll starting gear
              </button>
              <ul className="space-y-1.5 text-[11px] bg-zinc-900/40 border border-zinc-800 rounded px-2 py-2 max-h-48 overflow-y-auto">
                {draft.startingItems.map((it) => (
                  <li key={it.id} className="flex gap-2 items-baseline">
                    <span className="text-zinc-500 shrink-0 min-w-[4.75rem] tabular-nums">
                      {itemTypeLabel(it.type)}
                    </span>
                    <span className="text-zinc-400 shrink-0">·</span>
                    <span className="text-zinc-200 text-right flex-1">{it.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3 text-xs">
              <WizardTip title="Occupation table and starting cash">
                <p>
                  Monthly salary comes from the Occupation Table, keyed off your{' '}
                  <span className="text-zinc-300">special ability level</span> from the Career step. Multiply by{' '}
                  <span className="text-zinc-300">1D6÷3</span> for how many months of that salary you banked, then roll
                  again — on <span className="text-zinc-300">5+</span> you are unemployed and lose half (p.58).
                </p>
                <p>
                  Roll here to randomize, or type an amount everyone at the table agrees on for a cinematic start.
                </p>
              </WizardTip>
              <p>
                Monthly salary (occupation table, from special level):{' '}
                <span className="text-emerald-300 font-mono">{salary.toLocaleString()} eb</span>
              </p>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase text-zinc-500">Starting eurobucks</span>
                <input
                  type="number"
                  min={0}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 font-mono"
                  value={draft.eurobucks}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      eurobucks: Math.max(0, Math.floor(Number.parseInt(e.target.value, 10) || 0)),
                    })
                  }
                />
              </label>
              <button
                type="button"
                onClick={rollFunds}
                className="w-full text-[10px] uppercase py-2 rounded border border-emerald-800/60 text-emerald-200 hover:bg-emerald-950/25"
              >
                Roll starting funds (book: salary × D6÷3, unemployment check)
              </button>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-2 text-[11px] text-zinc-300">
              <WizardTip title="Before you save">
                <p>
                  This summary should match your table&apos;s reading of the rules. If anything failed validation, fix it
                  on the earlier tabs—common issues are stat totals not matching Character Points, career lines not
                  summing to 40, or pickup points exceeding REF+INT.
                </p>
              </WizardTip>
              <p>
                <span className="text-zinc-500">Name:</span> {draft.name}
              </p>
              <p>
                <span className="text-zinc-500">Role:</span> {draft.role} · {draft.points} CP · age {draft.age}
              </p>
              <p>
                <span className="text-zinc-500">Funds:</span> {draft.eurobucks.toLocaleString()} eb
              </p>
              <p className="text-zinc-500">Stats: {CP2020_STAT_KEYS.map((k) => `${k.toUpperCase()} ${draft.statBases[k]}`).join(', ')}</p>
              <p className="text-zinc-500">
                Career {c40}/40 · Pickup {spentPickup}/{pickupPool}
              </p>
              <p className="text-zinc-500">
                <span className="text-zinc-500">Starting gear:</span>{' '}
                {draft.startingItems.length === 0
                  ? '—'
                  : draft.startingItems.map((i) => `${itemTypeLabel(i.type)}: ${i.name}`).join('; ')}
              </p>
              {draft.gearTableRoll && (
                <p className="text-zinc-500">
                  <span className="text-zinc-500">Armor/weapon table:</span> D10 {draft.gearTableRoll.d10} +{' '}
                  {draft.gearTableRoll.modifier} → row {draft.gearTableRoll.tableIndex}
                </p>
              )}
              <p className="text-zinc-500">
                <span className="text-zinc-500">Life tab:</span>{' '}
                {[draft.lifepath.style.clothes, draft.lifepath.ethnicity].filter(Boolean).join(' · ') || '—'}
              </p>
              {reviewErrors.length > 0 && (
                <ul className="text-amber-400 text-xs list-disc pl-4 space-y-0.5">
                  {reviewErrors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-zinc-800 px-4 py-3 flex justify-between gap-2">
          <button
            type="button"
            onClick={step === 0 ? onClose : goBack}
            className="text-xs uppercase px-3 py-1.5 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-900"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={goNext}
              className="text-xs uppercase px-3 py-1.5 rounded border border-cyan-700 text-cyan-200 hover:bg-cyan-950/40 disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !canNext}
              onClick={() => void submit()}
              className="text-xs uppercase px-3 py-1.5 rounded border border-emerald-700 text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Create character'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
