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

/** A single PAD slot as stored on disk (binary / IDB shape). */
export interface PadSlotStored {
  name: string;
  /** PCM samples as an ArrayBuffer for structured-clone efficiency. */
  buffer: ArrayBuffer | null;
  volume: number;
  pan: number;
  pitch: number;
  playMode: "one" | "gate" | "loop";
  trimStart: number;
  trimEnd: number;
  loopBeats: number;
  muteGroup: number;
}

/** Full PAD workspace as stored on disk. */
export interface PadStateStored {
  slots: PadSlotStored[];
  seqGrid: boolean[][];
  seqNumSteps: number;
  seqSwing: number;
}

/**
 * Serializable session data — stored directly in IndexedDB.
 *
 * `syncMode` and `pad` are optional so sessions saved by older versions
 * (v0.1.0 and earlier, before PAD persistence) continue to load cleanly.
 * Loaders must default missing fields sensibly.
 */
export interface SessionData {
  name: string;            // session identifier (also the IndexedDB key)
  savedAt: number;         // timestamp for sorting
  bpm: number;
  timingMode: "free" | "quantized";
  /** Added in v0.2.0 — optional for backwards compatibility. */
  syncMode?: "free" | "sync" | "lock";
  masterLoopLength: number;
  tracks: {
    layers: ArrayBuffer[];  // raw Float32 data as ArrayBuffers (structured-cloneable)
    volume: number;
    isReversed: boolean;
    playbackRate: number;
    loopLengthSamples: number;
  }[];
  /** Added in v0.2.0 — optional for backwards compatibility. */
  pad?: PadStateStored;
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

/**
 * Lightweight summary of a saved session — no ArrayBuffer data.
 * Returned by `listSessions` so the session panel can render thumbnails
 * without loading multi-megabyte audio buffers.
 */
export interface SessionMeta {
  name: string;
  savedAt: number;
  bpm: number;
  syncMode: "free" | "sync" | "lock";
  timingMode: "free" | "quantized";
  /** Layer count for each looper track (index = track index). */
  trackLayers: number[];
  /** Number of PAD slots that have audio loaded. */
  padSlots: number;
}

/** List all saved sessions as lightweight metadata, sorted newest first. */
export async function listSessions(): Promise<SessionMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const sessions = (req.result as SessionData[])
        .filter((s) => s.name !== "__pinned__")
        .map<SessionMeta>((s) => ({
          name: s.name,
          savedAt: s.savedAt,
          bpm: s.bpm ?? 120,
          syncMode: s.syncMode ?? "free",
          timingMode: s.timingMode ?? "free",
          trackLayers: s.tracks.map((t) => t.layers.length),
          padSlots: s.pad?.slots.filter((sl) => !!sl.buffer).length ?? 0,
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
