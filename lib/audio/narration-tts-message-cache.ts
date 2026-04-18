/**
 * Client-side cache for GET /api/session/narration-tts (per message) so replay
 * uses the same WAV without another Cartesia round-trip. Memory + IndexedDB
 * so revisits survive refresh within the same browser profile.
 */

const DB_NAME = 'cp2020-narration-tts';
const DB_VERSION = 1;
const STORE = 'wav';
const MAX_IDB_ENTRIES = 80;

const memory = new Map<string, Blob>();

function cacheKey(sessionId: string, messageId: string): string {
  return `${sessionId}\0${messageId}`;
}

export function getNarrationTtsFromMemory(sessionId: string, messageId: string): Blob | undefined {
  return memory.get(cacheKey(sessionId, messageId));
}

export function setNarrationTtsInMemory(sessionId: string, messageId: string, blob: Blob): void {
  memory.set(cacheKey(sessionId, messageId), blob);
}

export function clearNarrationTtsMemoryForSession(sessionId: string): void {
  const prefix = `${sessionId}\0`;
  for (const k of memory.keys()) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function idbPruneOld(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as { key: string; savedAt: number }[]) ?? [];
      if (rows.length <= MAX_IDB_ENTRIES) {
        resolve();
        return;
      }
      rows.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
      const drop = rows.slice(0, rows.length - MAX_IDB_ENTRIES);
      const tx2 = db.transaction(STORE, 'readwrite');
      const st2 = tx2.objectStore(STORE);
      for (const r of drop) st2.delete(r.key);
      tx2.oncomplete = () => resolve();
      tx2.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

export async function getNarrationTtsFromIdb(sessionId: string, messageId: string): Promise<Blob | null> {
  const key = cacheKey(sessionId, messageId);
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      const row = req.result as { blob?: Blob } | undefined;
      resolve(row?.blob instanceof Blob ? row.blob : null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function setNarrationTtsInIdb(sessionId: string, messageId: string, blob: Blob): Promise<void> {
  const key = cacheKey(sessionId, messageId);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, blob, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  await idbPruneOld(db);
}
