/**
 * IndexedDB session storage for mloop.
 * Stores track buffers + settings per session.
 */

const DB_NAME = "mloop-sessions";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

export interface SessionData {
  name: string;
  savedAt: number;
  bpm: number;
  timingMode: "free" | "quantized";
  masterLoopLength: number;
  tracks: {
    layers: ArrayBuffer[];  // raw Float32 data as ArrayBuffers
    volume: number;
    isReversed: boolean;
    playbackRate: number;
    loopLengthSamples: number;
  }[];
}

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

export async function saveSession(session: SessionData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSession(name: string): Promise<SessionData | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(name);
    req.onsuccess = () => resolve(req.result as SessionData | undefined);
    req.onerror = () => reject(req.error);
  });
}

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

export async function deleteSession(name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
