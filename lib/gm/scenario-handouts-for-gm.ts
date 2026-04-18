import catalog from '@/lib/data/scenario-handouts.json';

export type ScenarioHandoutForLlm = {
  id: string;
  caption: string;
  url: string;
};

type CatalogImage = {
  id: string;
  objectPath: string;
  caption: string;
};

type CatalogSet = {
  id: string;
  sessionNameContains: string[];
  /** When the session has this `activeScenarioId`, use this handout set (same as scenario markdown). */
  activeScenarioIds?: string[];
  bucket: string;
  images: CatalogImage[];
};

function isCatalogSet(v: unknown): v is CatalogSet {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return false;
  if (typeof o.bucket !== 'string' || !o.bucket.trim()) return false;
  if (!Array.isArray(o.sessionNameContains)) return false;
  if (!o.sessionNameContains.every((x) => typeof x === 'string')) return false;
  if (o.activeScenarioIds !== undefined) {
    if (!Array.isArray(o.activeScenarioIds)) return false;
    if (!o.activeScenarioIds.every((x) => typeof x === 'string')) return false;
  }
  if (!Array.isArray(o.images)) return false;
  for (const im of o.images) {
    if (!im || typeof im !== 'object' || Array.isArray(im)) return false;
    const row = im as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id.trim()) return false;
    if (typeof row.objectPath !== 'string' || !row.objectPath.trim()) return false;
    if (typeof row.caption !== 'string') return false;
  }
  return true;
}

function loadSets(): CatalogSet[] {
  const raw = catalog as { sets?: unknown };
  if (!raw.sets || !Array.isArray(raw.sets)) return [];
  return raw.sets.filter(isCatalogSet);
}

/**
 * Public Storage object URL (same pattern as soundtrack helper).
 */
export function publicSupabaseStorageObjectUrl(
  supabaseProjectUrl: string | undefined,
  bucket: string,
  objectPath: string,
): string | null {
  const base = supabaseProjectUrl?.replace(/\/$/, '').trim();
  if (!base) return null;
  const b = bucket.trim();
  const p = objectPath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  if (!b || !p) return null;
  return `${base}/storage/v1/object/public/${b}/${p}`;
}

function sessionMatchesSet(sessionNameNorm: string, needles: string[]): boolean {
  for (const n of needles) {
    const t = n.trim().toLowerCase();
    if (t && sessionNameNorm.includes(t)) return true;
  }
  return false;
}

function setMatchesActiveScenario(activeScenarioId: string | null | undefined, ids: string[] | undefined): boolean {
  if (!activeScenarioId || !ids || ids.length === 0) return false;
  return ids.includes(activeScenarioId);
}

/**
 * Pick catalog images when the session name matches configured substrings **or**
 * `sessions.settings.activeScenarioId` matches `activeScenarioIds` in the catalog.
 */
export function scenarioHandoutsForSession(
  sessionName: string,
  supabaseProjectUrl?: string | null,
  activeScenarioId?: string | null,
): ScenarioHandoutForLlm[] {
  const norm = sessionName.trim().toLowerCase();
  const base = supabaseProjectUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sets = loadSets();
  for (const set of sets) {
    const byName = norm ? sessionMatchesSet(norm, set.sessionNameContains) : false;
    const byScenario = setMatchesActiveScenario(activeScenarioId ?? null, set.activeScenarioIds);
    if (!byName && !byScenario) continue;
    const out: ScenarioHandoutForLlm[] = [];
    for (const im of set.images) {
      const url = publicSupabaseStorageObjectUrl(base ?? undefined, set.bucket, im.objectPath);
      if (!url) continue;
      out.push({ id: im.id, caption: im.caption, url });
    }
    return out;
  }
  return [];
}

/** JSON string for the GM user block (always a JSON array). */
export function scenarioHandoutsJsonForGmSession(
  sessionName: string,
  supabaseProjectUrl?: string | null,
  activeScenarioId?: string | null,
): string {
  const list = scenarioHandoutsForSession(sessionName, supabaseProjectUrl, activeScenarioId);
  return JSON.stringify(list);
}
