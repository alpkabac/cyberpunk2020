/**
 * Published adventure modules shipped under `lib/scenarios/*.md`.
 * IDs are stable keys stored in `sessions.settings.activeScenarioId`.
 */

export const SCENARIO_CATALOG = [
  {
    id: 'a-night-at-opera',
    title: 'A Night at the Opera',
    filename: 'ANightAtOpera.md',
  },
] as const;

export type ScenarioCatalogEntry = (typeof SCENARIO_CATALOG)[number];
export type ScenarioId = ScenarioCatalogEntry['id'];

const KNOWN_IDS = new Set<string>(SCENARIO_CATALOG.map((s) => s.id));

export function parseActiveScenarioId(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  return KNOWN_IDS.has(raw) ? raw : null;
}

export function scenarioTitleForId(id: string | null | undefined): string | null {
  if (!id) return null;
  const e = SCENARIO_CATALOG.find((s) => s.id === id);
  return e?.title ?? null;
}
