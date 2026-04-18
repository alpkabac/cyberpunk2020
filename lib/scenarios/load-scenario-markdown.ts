import fs from 'node:fs';
import path from 'node:path';

import { SCENARIO_CATALOG } from './catalog';

/** Rough cap so one module cannot dominate the entire GM context budget. */
const MAX_SCENARIO_CHARS = 120_000;

/**
 * Loads the markdown body for the active scenario (server-side only).
 * Returns `null` when none selected or file missing.
 */
export function loadScenarioMarkdownForGm(activeScenarioId: string | null | undefined): string | null {
  if (!activeScenarioId) return null;
  const entry = SCENARIO_CATALOG.find((s) => s.id === activeScenarioId);
  if (!entry) return null;
  const fullPath = path.join(process.cwd(), 'lib', 'scenarios', entry.filename);
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    const t = raw.trim();
    if (!t) return null;
    if (t.length <= MAX_SCENARIO_CHARS) return t;
    return `${t.slice(0, Math.max(0, MAX_SCENARIO_CHARS - 1))}…`;
  } catch {
    return null;
  }
}
