/**
 * Persistence and session I/O handlers for the loop engine.
 *
 * Extracted from `loopEngineCommands.ts` so that the async command
 * runner stays focused on engine mutations and the serialization /
 * file I/O surface can be unit tested on its own.
 *
 * Every function in here takes an AudioEngine and returns a promise;
 * user-facing errors (storage full, bad file) surface through alerts
 * rather than throwing, matching the pre-refactor behavior.
 */

import type { AudioEngine } from "../engine/AudioEngine";
import { saveSession, loadSession } from "../utils/storage";
import type { SessionData } from "../utils/storage";
import { encodeWav } from "../utils/wav";
import { mixBuffers } from "../utils/bufferOps";
import { saveFileAs, openFile } from "../utils/fileExport";
import { encodeShareLink } from "../utils/shareLink";

/** JSON shape for the `.mloop-session.json` export/import format. */
export interface SessionExport {
  version: 1;
  bpm: number;
  timingMode: AudioEngine["timingMode"];
  syncMode: AudioEngine["syncMode"];
  masterLoopLength: number;
  tracks: Array<{
    layers: number[][];
    volume: number;
    isReversed: boolean;
    playbackRate: number;
    loopLengthSamples: number;
  }>;
}

/** Build the portable JSON session export. Pure over the engine snapshot. */
export function serializeSessionExport(engine: AudioEngine): SessionExport {
  return {
    version: 1,
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
}

/** Build the binary-friendly session shape used by localStorage. */
export function serializeSessionData(engine: AudioEngine, name: string): SessionData {
  return {
    name,
    savedAt: Date.now(),
    bpm: engine.timing.bpm,
    timingMode: engine.timingMode,
    masterLoopLength: engine.masterLoopLength,
    tracks: engine.tracks.map((t) => ({
      layers: t.getLayers().map((l) => l.buffer.slice(0) as ArrayBuffer),
      volume: t.volume,
      isReversed: t.isReversed,
      playbackRate: t.playbackRate,
      loopLengthSamples: t.loopLengthSamples,
    })),
  };
}

/** Apply a parsed `SessionExport` back onto the engine. */
export function applySessionExport(engine: AudioEngine, data: unknown): void {
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
}

// ── Command handlers ─────────────────────────────────────────────────────

export async function handleSaveSession(engine: AudioEngine, name: string): Promise<void> {
  const session = serializeSessionData(engine, name);
  try {
    await saveSession(session);
  } catch (e) {
    console.error("Session save failed:", e);
    alert("Failed to save session. Storage may be full.");
  }
}

export async function handleLoadSession(engine: AudioEngine, name: string): Promise<void> {
  const session = await loadSession(name);
  if (!session) return;
  engine.stopAll();
  engine.masterLoopLength = session.masterLoopLength;
  engine.timing.bpm = session.bpm;
  engine.timingMode = session.timingMode;
  for (let i = 0; i < engine.tracks.length; i++) {
    const td = session.tracks[i];
    if (!td) continue;
    const layers = td.layers.map((ab) => new Float32Array(ab));
    engine.tracks[i].restoreLayers(layers, td.loopLengthSamples);
    engine.tracks[i].volume = td.volume;
    engine.tracks[i].isReversed = td.isReversed;
    engine.tracks[i].playbackRate = td.playbackRate;
  }
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

export async function handleExportSessionFile(engine: AudioEngine): Promise<void> {
  const json = JSON.stringify(serializeSessionExport(engine));
  await saveFileAs(new Blob([json], { type: "application/json" }), "mloop-session.json");
}

export async function handleImportSessionFile(engine: AudioEngine): Promise<void> {
  const file = await openFile(".json");
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applySessionExport(engine, data);
  } catch (e) {
    alert("Failed to import session: " + (e instanceof Error ? e.message : "Unknown error"));
  }
}

export async function handlePinSession(engine: AudioEngine): Promise<void> {
  const pinData = serializeSessionData(engine, "__pinned__");
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
