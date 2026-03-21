/**
 * IndexedDB session storage for mloop.
 *
 * Uses IndexedDB (not localStorage) because sessions contain large
 * Float32Array audio buffers that would exceed localStorage's ~5MB limit.
 * Each session stores all track layers as raw ArrayBuffers plus settings.
 */

const DB_NAME = "mloop-sessions";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

/** Serializable session data — stored directly in IndexedDB. */
export interface SessionData {
  name: string;            // session identifier (also the IndexedDB key)
  savedAt: number;         // timestamp for sorting
  bpm: number;
  timingMode: "free" | "quantized";
  masterLoopLength: number;
  tracks: {
    layers: ArrayBuffer[];  // raw Float32 data as ArrayBuffers (structured-cloneable)
    volume: number;
    isReversed: boolean;
    playbackRate: number;
    loopLengthSamples: number;
  }[];
}

/**
 * Open (or create) the IndexedDB database.
 * On first open, creates the "sessions" object store keyed by name.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save a session (upsert — overwrites if name already exists). */
export async function saveSession(session: SessionData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load a session by name. Returns undefined if not found. */
export async function loadSession(name: string): Promise<SessionData | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(name);
    req.onsuccess = () => resolve(req.result as SessionData | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** List all saved sessions (name + timestamp), sorted newest first. */
export async function listSessions(): Promise<{ name: string; savedAt: number }[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const sessions = (req.result as SessionData[]).map((s) => ({
        name: s.name,
        savedAt: s.savedAt,
      }));
      sessions.sort((a, b) => b.savedAt - a.savedAt);
      resolve(sessions);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete a session by name. */
export async function deleteSession(name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
