/**
 * Persistence and session I/O handlers for the loop engine.
 *
 * Extracted from `loopEngineCommands.ts` so the async command runner can
 * stay focused on engine mutations and the serialization / file I/O
 * surface can be unit-tested on its own.
 *
 * As of v0.2.0 these helpers are responsible for BOTH the looper state
 * (AudioEngine / LoopTrack) and the PAD-mode workspace (PadEngine). All
 * of the user-visible persistence paths — IndexedDB "save session",
 * JSON export, JSON import, pinned autoload, share links — go through
 * here, so the two modes stay coherent with each other.
 *
 * The two persistence surfaces have different serialization shapes:
 *
 *   • IndexedDB (SessionData) — uses `ArrayBuffer` for binary efficiency
 *     and relies on structured-clone. This is what `save_session`,
 *     `pin_session`, and `load_session` touch.
 *
 *   • JSON export/import (SessionExport) — uses `number[]` so a
 *     `.mloop-session.json` file is portable across browsers and can
 *     be diffed by humans.
 *
 * PadEngine speaks a single runtime shape (`PadSnapshot`) with
 * `Float32Array` buffers. Conversion between PadSnapshot and the two
 * persisted shapes happens in this file.
 */

import type { AudioEngine } from "../engine/AudioEngine";
import type { PadPersistencePort, PadSlotSnapshot, PadSnapshot } from "../engine/PadEngine";
import type { SyncMode, TimingMode } from "../types";
import { saveSession, loadSession } from "../utils/storage";
import type { PadSlotStored, PadStateStored, SessionData } from "../utils/storage";
import { encodeWav } from "../utils/wav";
import { mixBuffers } from "../utils/bufferOps";
import { saveFileAs, openFile } from "../utils/fileExport";
import { encodeShareLink } from "../utils/shareLink";

// ── Session export JSON shape ───────────────────────────────────────────

/** JSON shape for a single PAD slot in the export file. */
export interface PadSlotExport {
  name: string;
  /** PCM samples as a regular number[] for JSON portability. */
  buffer: number[] | null;
  volume: number;
  pan: number;
  pitch: number;
  playMode: "one" | "gate" | "loop";
  trimStart: number;
  trimEnd: number;
  loopBeats: number;
  muteGroup: number;
}

/** JSON shape for the full PAD workspace in the export file. */
export interface PadStateExport {
  slots: PadSlotExport[];
  seqGrid: boolean[][];
  seqNumSteps: number;
  seqSwing: number;
}

/** JSON shape for the `.mloop-session.json` export/import format. */
export interface SessionExport {
  version: 1 | 2;
  bpm: number;
  timingMode: TimingMode;
  syncMode: SyncMode;
  masterLoopLength: number;
  tracks: Array<{
    layers: number[][];
    volume: number;
    isReversed: boolean;
    playbackRate: number;
    loopLengthSamples: number;
  }>;
  /** Added in version 2 (v0.2.0). Optional so version-1 files still load. */
  pad?: PadStateExport;
}

// ── Pad snapshot ↔ persistence-format converters ────────────────────────

/** PadSnapshot → binary (IDB) shape. */
export function padSnapshotToStored(snap: PadSnapshot): PadStateStored {
  return {
    slots: snap.slots.map<PadSlotStored>((s) => ({
      name: s.name,
      buffer: s.buffer ? (s.buffer.buffer.slice(s.buffer.byteOffset, s.buffer.byteOffset + s.buffer.byteLength) as ArrayBuffer) : null,
      volume: s.volume,
      pan: s.pan,
      pitch: s.pitch,
      playMode: s.playMode,
      trimStart: s.trimStart,
      trimEnd: s.trimEnd,
      loopBeats: s.loopBeats,
      muteGroup: s.muteGroup,
    })),
    seqGrid: snap.seqGrid.map((row) => [...row]),
    seqNumSteps: snap.seqNumSteps,
    seqSwing: snap.seqSwing,
  };
}

/** Binary (IDB) shape → PadSnapshot. */
export function padStoredToSnapshot(stored: PadStateStored): PadSnapshot {
  return {
    version: 1,
    slots: stored.slots.map<PadSlotSnapshot>((s) => ({
      name: s.name ?? "",
      buffer: s.buffer ? new Float32Array(s.buffer) : null,
      volume: s.volume ?? 1,
      pan: s.pan ?? 0,
      pitch: s.pitch ?? 0,
      playMode: s.playMode ?? "one",
      trimStart: s.trimStart ?? 0,
      trimEnd: s.trimEnd ?? 1,
      loopBeats: s.loopBeats ?? 0,
      muteGroup: s.muteGroup ?? 0,
    })),
    seqGrid: Array.isArray(stored.seqGrid) ? stored.seqGrid.map((row) => [...row]) : [],
    seqNumSteps: stored.seqNumSteps ?? 16,
    seqSwing: stored.seqSwing ?? 0,
  };
}

/** PadSnapshot → JSON (portable) shape. */
export function padSnapshotToExport(snap: PadSnapshot): PadStateExport {
  return {
    slots: snap.slots.map<PadSlotExport>((s) => ({
      name: s.name,
      buffer: s.buffer ? Array.from(s.buffer) : null,
      volume: s.volume,
      pan: s.pan,
      pitch: s.pitch,
      playMode: s.playMode,
      trimStart: s.trimStart,
      trimEnd: s.trimEnd,
      loopBeats: s.loopBeats,
      muteGroup: s.muteGroup,
    })),
    seqGrid: snap.seqGrid.map((row) => [...row]),
    seqNumSteps: snap.seqNumSteps,
    seqSwing: snap.seqSwing,
  };
}

/** JSON (portable) shape → PadSnapshot. */
export function padExportToSnapshot(exp: PadStateExport): PadSnapshot {
  return {
    version: 1,
    slots: exp.slots.map<PadSlotSnapshot>((s) => ({
      name: s.name ?? "",
      buffer: s.buffer && s.buffer.length > 0 ? new Float32Array(s.buffer) : null,
      volume: s.volume ?? 1,
      pan: s.pan ?? 0,
      pitch: s.pitch ?? 0,
      playMode: s.playMode ?? "one",
      trimStart: s.trimStart ?? 0,
      trimEnd: s.trimEnd ?? 1,
      loopBeats: s.loopBeats ?? 0,
      muteGroup: s.muteGroup ?? 0,
    })),
    seqGrid: Array.isArray(exp.seqGrid) ? exp.seqGrid.map((row) => [...row]) : [],
    seqNumSteps: exp.seqNumSteps ?? 16,
    seqSwing: exp.seqSwing ?? 0,
  };
}

// ── Session introspection ───────────────────────────────────────────────

/**
 * True if a stored session carries any meaningful content — either looper
 * layers or PAD sample buffers. Used by the UI (pinned-session indicator)
 * and the pinned autoload path so PAD-only pinned sessions count as "has
 * content" even when the looper is empty.
 */
export function sessionHasContent(session: SessionData | undefined | null): boolean {
  if (!session) return false;
  if (session.tracks.some((t) => t.layers.length > 0)) return true;
  if (session.pad?.slots.some((s) => !!s.buffer)) return true;
  return false;
}

// ── Engine → persistence (serialize) ────────────────────────────────────

/**
 * Build the portable JSON session export. Pure over the engine snapshots —
 * no side effects, safe to unit test. If `padEngine` is null the resulting
 * export contains no pad section and the version is pinned to 1 for max
 * backwards compatibility.
 */
export function serializeSessionExport(engine: AudioEngine, padEngine: PadPersistencePort | null): SessionExport {
  const base: SessionExport = {
    version: padEngine ? 2 : 1,
    bpm: engine.timing.bpm,
    timingMode: engine.timingMode,
    syncMode: engine.syncMode,
    masterLoopLength: engine.masterLoopLength,
    tracks: engine.tracks.map((t) => ({
      layers: t.getLayers().map((l) => Array.from(l)),
      volume: t.volume,
      isReversed: t.isReversed,
      playbackRate: t.playbackRate,
      loopLengthSamples: t.loopLengthSamples,
    })),
  };
  if (padEngine) {
    base.pad = padSnapshotToExport(padEngine.getSnapshot());
  }
  return base;
}

/** Build the binary-friendly session shape used by IndexedDB. */
export function serializeSessionData(engine: AudioEngine, padEngine: PadPersistencePort | null, name: string): SessionData {
  const data: SessionData = {
    name,
    savedAt: Date.now(),
    bpm: engine.timing.bpm,
    timingMode: engine.timingMode,
    syncMode: engine.syncMode,
    masterLoopLength: engine.masterLoopLength,
    tracks: engine.tracks.map((t) => ({
      layers: t.getLayers().map((l) => l.buffer.slice(0) as ArrayBuffer),
      volume: t.volume,
      isReversed: t.isReversed,
      playbackRate: t.playbackRate,
      loopLengthSamples: t.loopLengthSamples,
    })),
  };
  if (padEngine) {
    data.pad = padSnapshotToStored(padEngine.getSnapshot());
  }
  return data;
}

// ── Persistence → engine (apply) ────────────────────────────────────────

/**
 * Apply a parsed {@link SessionData} back onto the engine pair. Looper
 * state flows through AudioEngine/LoopTrack; PAD state flows through
 * PadEngine. Missing fields default sensibly (for legacy sessions saved
 * before v0.2.0).
 */
export function applySessionData(engine: AudioEngine, padEngine: PadPersistencePort | null, data: SessionData): void {
  engine.stopAll();
  engine.masterLoopLength = data.masterLoopLength ?? 0;
  engine.timing.bpm = data.bpm ?? 120;
  engine.timingMode = data.timingMode ?? "free";
  if (data.syncMode) {
    engine.syncMode = data.syncMode;
  }
  for (let i = 0; i < engine.tracks.length; i++) {
    const td = data.tracks[i];
    if (!td) continue;
    const layers = td.layers.map((ab) => new Float32Array(ab));
    engine.tracks[i].restoreLayers(layers, td.loopLengthSamples ?? 0);
    engine.tracks[i].volume = td.volume ?? 0.8;
    engine.tracks[i].isReversed = td.isReversed ?? false;
    engine.tracks[i].playbackRate = td.playbackRate ?? 1;
  }

  if (padEngine && data.pad) {
    padEngine.loadSnapshot(padStoredToSnapshot(data.pad));
  }
}

/** Apply a parsed {@link SessionExport} back onto the engine pair. */
export function applySessionExport(engine: AudioEngine, padEngine: PadPersistencePort | null, data: unknown): void {
  if (
    typeof data !== "object" || data === null ||
    !("version" in data) || !("tracks" in data) || !Array.isArray((data as SessionExport).tracks)
  ) {
    throw new Error("Invalid session file");
  }
  const d = data as SessionExport;
  engine.stopAll();
  engine.masterLoopLength = d.masterLoopLength ?? 0;
  engine.timing.bpm = d.bpm ?? 120;
  engine.timingMode = d.timingMode ?? "free";
  engine.syncMode = d.syncMode ?? "free";
  for (let i = 0; i < engine.tracks.length; i++) {
    const td = d.tracks[i];
    if (!td) continue;
    const layers = td.layers.map((arr) => new Float32Array(arr));
    engine.tracks[i].restoreLayers(layers, td.loopLengthSamples ?? 0);
    engine.tracks[i].volume = td.volume ?? 0.8;
    engine.tracks[i].isReversed = td.isReversed ?? false;
    engine.tracks[i].playbackRate = td.playbackRate ?? 1;
  }

  if (padEngine && d.pad) {
    padEngine.loadSnapshot(padExportToSnapshot(d.pad));
  }
}

// ── Command handlers ────────────────────────────────────────────────────

export async function handleSaveSession(engine: AudioEngine, padEngine: PadPersistencePort | null, name: string): Promise<void> {
  const session = serializeSessionData(engine, padEngine, name);
  try {
    await saveSession(session);
  } catch (e) {
    console.error("Session save failed:", e);
    alert("Failed to save session. Storage may be full.");
  }
}

export async function handleLoadSession(engine: AudioEngine, padEngine: PadPersistencePort | null, name: string): Promise<void> {
  const session = await loadSession(name);
  if (!session) return;
  applySessionData(engine, padEngine, session);
}

export async function handleExportWav(engine: AudioEngine): Promise<void> {
  const bufs: Float32Array[] = [];
  for (const t of engine.tracks) {
    const data = t.getMixedData();
    if (data) bufs.push(data);
  }
  if (bufs.length === 0) return;
  const maxLen = Math.max(...bufs.map((b) => b.length));
  const padded = bufs.map((b) => {
    if (b.length === maxLen) return b;
    const p = new Float32Array(maxLen);
    p.set(b);
    return p;
  });
  const mixed = mixBuffers(padded);
  const wav = encodeWav(mixed, engine.ctx.sampleRate, {
    title: "mloop mixdown",
    software: "mloop — https://mloop.mpump.live",
    date: new Date().toISOString().slice(0, 10),
  });
  await saveFileAs(new Blob([wav], { type: "audio/wav" }), "mloop-mixdown.wav");
}

export async function handleExportSessionFile(engine: AudioEngine, padEngine: PadPersistencePort | null): Promise<void> {
  const json = JSON.stringify(serializeSessionExport(engine, padEngine));
  await saveFileAs(new Blob([json], { type: "application/json" }), "mloop-session.json");
}

export async function handleImportSessionFile(engine: AudioEngine, padEngine: PadPersistencePort | null): Promise<void> {
  const file = await openFile(".json");
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applySessionExport(engine, padEngine, data);
  } catch (e) {
    alert("Failed to import session: " + (e instanceof Error ? e.message : "Unknown error"));
  }
}

export async function handlePinSession(engine: AudioEngine, padEngine: PadPersistencePort | null): Promise<void> {
  const pinData = serializeSessionData(engine, padEngine, "__pinned__");
  try {
    await saveSession(pinData);
  } catch {
    alert("Failed to pin session.");
  }
}

export async function handleShareLink(engine: AudioEngine): Promise<void> {
  const fx = engine.tracks[0]?.getEffects() ?? {};
  const url = encodeShareLink({
    bpm: engine.timing.bpm,
    timingMode: engine.timingMode,
    syncMode: engine.syncMode,
    effects: fx as unknown as Record<string, unknown>,
  });
  try {
    await navigator.clipboard.writeText(url);
    alert("Share link copied to clipboard!");
  } catch {
    prompt("Share this link:", url);
  }
}
