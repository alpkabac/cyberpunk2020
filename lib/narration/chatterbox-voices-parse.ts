/**
 * Chatterbox-TTS-Server often returns `{ filename: "x.wav" }` (or similar), not bare strings.
 * Never use String(object) — that becomes "[object Object]".
 */

const OBJECT_STRING_KEYS = [
  'filename',
  'name',
  'file',
  'path',
  'label',
  'id',
  'voice_id',
  'voiceId',
  'value',
  'basename',
  'title',
] as const;

/** Single voice / file entry from Chatterbox JSON → displayable filename. */
export function normalizeChatterboxFileEntry(item: unknown): string | null {
  if (item == null) return null;
  if (typeof item === 'string') {
    const s = item.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof item === 'number' && Number.isFinite(item)) {
    return String(item);
  }
  if (typeof item === 'object' && !Array.isArray(item)) {
    const o = item as Record<string, unknown>;
    for (const k of OBJECT_STRING_KEYS) {
      const v = o[k];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
  }
  return null;
}

function dedupeSorted(strings: string[]): string[] {
  const unique = [...new Set(strings.filter((s) => s.length > 0))];
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

const VOICE_LIST_KEYS = [
  'voices',
  'predefined_voices',
  'predefinedVoices',
  'predefined_voice_files',
  'voice_files',
  'files',
  'data',
  'results',
  'items',
];

const REFERENCE_LIST_KEYS = [
  'reference_files',
  'reference_audio',
  'referenceAudio',
  'referenceFiles',
  'reference_files_list',
  'files',
  'data',
  'results',
  'items',
];

function collectFromObjectKeys(o: Record<string, unknown>, keyList: string[]): string[] {
  const out: string[] = [];
  for (const k of keyList) {
    const v = o[k];
    if (!Array.isArray(v)) continue;
    for (const x of v) {
      const n = normalizeChatterboxFileEntry(x);
      if (n) out.push(n);
    }
  }
  return out;
}

/**
 * Predefined voices from `/get_predefined_voices` or nested UI payloads.
 */
export function parseChatterboxVoicesPayload(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const x of raw) {
      const n = normalizeChatterboxFileEntry(x);
      if (n) out.push(n);
    }
    return dedupeSorted(out);
  }

  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return dedupeSorted(collectFromObjectKeys(o, VOICE_LIST_KEYS));
  }

  return [];
}

/**
 * Reference / clone audio files from `/get_reference_files` or nested payloads.
 */
export function parseChatterboxReferencePayload(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const x of raw) {
      const n = normalizeChatterboxFileEntry(x);
      if (n) out.push(n);
    }
    return dedupeSorted(out);
  }

  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const out = collectFromObjectKeys(o, REFERENCE_LIST_KEYS);
    return dedupeSorted(out);
  }

  return [];
}

/** Parse `/api/ui/initial-data` JSON for predefined voice filenames. */
export function extractPredefinedVoicesFromInitialData(raw: unknown): string[] {
  if (raw == null || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const direct = parseChatterboxVoicesPayload(o);
  if (direct.length > 0) return direct;
  const ui = o.ui_state;
  if (ui && typeof ui === 'object') {
    const nested = parseChatterboxVoicesPayload(ui as Record<string, unknown>);
    if (nested.length > 0) return nested;
  }
  const config = o.config;
  if (config && typeof config === 'object') {
    const nested = parseChatterboxVoicesPayload(config as Record<string, unknown>);
    if (nested.length > 0) return nested;
  }
  return [];
}

export function extractReferenceFilesFromInitialData(raw: unknown): string[] {
  if (raw == null || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const direct = parseChatterboxReferencePayload(o);
  if (direct.length > 0) return direct;
  const ui = o.ui_state;
  if (ui && typeof ui === 'object') {
    const nested = parseChatterboxReferencePayload(ui as Record<string, unknown>);
    if (nested.length > 0) return nested;
  }
  return [];
}
