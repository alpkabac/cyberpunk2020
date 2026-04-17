'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { serializeCharacterForDb } from '@/lib/db/character-serialize';
import type { RoleType, Stats } from '@/lib/types';
import { ROLE_SPECIAL_ABILITIES } from '@/lib/types';

const STEPS = ['Profile', 'Stats', 'Career', 'Pickup', 'Funds', 'Review'] as const;

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
  eurobucks: number;
};

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

  const changeRole = useCallback((role: RoleType) => {
    const rng = createCryptoRng();
    const { skills } = distributeCareerSkills(role, rng);
    const careerValues = Object.fromEntries(skills.map((s) => [s.name, s.value]));
    const careerSet = new Set(skills.map((s) => s.name));
    setDraft((d) => {
      if (!d) return d;
      const pickup = d.pickup.filter((p) => !careerSet.has(p.name));
      const spec = careerValues[ROLE_SPECIAL_ABILITIES[role]] ?? 1;
      return {
        ...d,
        role,
        careerValues,
        pickup,
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
    if (step === 4) return draft.eurobucks >= 0;
    if (step === 5) return reviewErrors.length === 0;
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
        className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-lg border border-violet-800/50 bg-zinc-950 shadow-2xl shadow-violet-950/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chargen-title"
      >
        <header className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="chargen-title" className="text-sm font-bold uppercase tracking-wider text-violet-300">
              New character
            </h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              CP2020 · Character Points, career package (40 + special), pickup (REF+INT), starting funds
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
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-xs">
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
                Roll starting funds (book: months × salary, unemployment check)
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2 text-[11px] text-zinc-300">
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
