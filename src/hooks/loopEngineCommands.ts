/**
 * Async command runner for the loop engine.
 *
 * Takes a LoopCommand and runs the corresponding mutation on the
 * AudioEngine. Returns a promise that resolves when the operation is
 * complete (and the engine state is ready to be re-read).
 *
 * Extracted from useLoopEngine so the hook body stays focused on
 * React wiring, not side effects.
 */

import type { LoopCommand } from "../types";
import type { AudioEngine } from "../engine/AudioEngine";
import { saveSession, loadSession } from "../utils/storage";
import type { SessionData } from "../utils/storage";
import { encodeWav } from "../utils/wav";
import { mixBuffers } from "../utils/bufferOps";
import { saveFileAs, openFile } from "../utils/fileExport";
import { encodeShareLink } from "../utils/shareLink";

/** Retry mic connection — no-op if already connected or engine missing. */
async function ensureMic(engine: AudioEngine): Promise<void> {
  if (engine.hasMic) return;
  try {
    await engine.initMic();
  } catch (e) {
    console.warn("Mic unavailable:", e);
  }
}

/**
 * Run a command against the engine. Exhaustive over the command union;
 * unknown types are a no-op. Throws only on programmer error — user-facing
 * errors (session save, file I/O) are handled with alerts at the call site.
 */
export async function runLoopCommand(engine: AudioEngine, cmd: LoopCommand): Promise<void> {
  switch (cmd.type) {
    case "track_record":
      await ensureMic(engine);
      await engine.recordTrack(cmd.trackId);
      return;
    case "track_stop":
      await engine.stopTrack(cmd.trackId);
      return;
    case "track_play":
      engine.playTrack(cmd.trackId);
      return;
    case "track_overdub":
      await ensureMic(engine);
      await engine.overdubTrack(cmd.trackId);
      return;
    case "track_mute": {
      const track = engine.tracks[cmd.trackId];
      track.muted = !track.muted;
      return;
    }
    case "track_clear":
      engine.clearTrack(cmd.trackId);
      return;
    case "track_undo":
      engine.tracks[cmd.trackId]?.undoLastLayer();
      return;
    case "track_reverse":
      engine.tracks[cmd.trackId]?.toggleReverse();
      return;
    case "track_half_speed":
      engine.tracks[cmd.trackId]?.toggleHalfSpeed();
      return;
    case "set_volume":
      engine.tracks[cmd.trackId].volume = cmd.volume;
      return;
    case "set_bpm":
      engine.setBpm(cmd.bpm);
      return;
    case "set_timing_mode":
      engine.setTimingMode(cmd.mode);
      return;
    case "set_sync_mode":
      engine.syncMode = cmd.mode;
      return;
    case "toggle_metronome":
      engine.toggleMetronome();
      return;
    case "tap_tempo":
      engine.tapTempo();
      return;
    case "track_toggle_effect": {
      const fx = engine.tracks[cmd.trackId]?.getEffects();
      if (fx) {
        const current = fx[cmd.name].on;
        engine.tracks[cmd.trackId].setEffect(cmd.name, { on: !current } as never);
      }
      return;
    }
    case "track_set_effect":
      engine.tracks[cmd.trackId]?.setEffect(cmd.name, cmd.params as never);
      return;
    case "import_file": {
      // Import decoded audio into a track; first import sets the master loop
      const track = engine.tracks[cmd.trackId];
      const len = track.importBuffer(cmd.buffer, engine.masterLoopLength);
      if (engine.masterLoopLength === 0 && len > 0) {
        engine.masterLoopLength = len;
      }
      return;
    }
    case "save_session": {
      const session: SessionData = {
        name: cmd.name,
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
      try {
        await saveSession(session);
      } catch (e) {
        console.error("Session save failed:", e);
        alert("Failed to save session. Storage may be full.");
      }
      return;
    }
    case "load_session": {
      const session = await loadSession(cmd.name);
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
      return;
    }
    case "export_wav": {
      const bufs: Float32Array[] = [];
      for (const t of engine.tracks) {
        const data = t.getMixedData();
        if (data) bufs.push(data);
      }
      if (bufs.length > 0) {
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
      return;
    }
    case "export_session_file": {
      const sessionExport = {
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
      const json = JSON.stringify(sessionExport);
      await saveFileAs(new Blob([json], { type: "application/json" }), "mloop-session.json");
      return;
    }
    case "import_session_file": {
      const file = await openFile(".json");
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version || !data.tracks) throw new Error("Invalid session file");
        engine.stopAll();
        engine.masterLoopLength = data.masterLoopLength ?? 0;
        engine.timing.bpm = data.bpm ?? 120;
        engine.timingMode = data.timingMode ?? "free";
        engine.syncMode = data.syncMode ?? "free";
        for (let i = 0; i < engine.tracks.length; i++) {
          const td = data.tracks[i];
          if (!td) continue;
          const layers = td.layers.map((arr: number[]) => new Float32Array(arr));
          engine.tracks[i].restoreLayers(layers, td.loopLengthSamples ?? 0);
          engine.tracks[i].volume = td.volume ?? 0.8;
          engine.tracks[i].isReversed = td.isReversed ?? false;
          engine.tracks[i].playbackRate = td.playbackRate ?? 1;
        }
      } catch (e) {
        alert("Failed to import session: " + (e instanceof Error ? e.message : "Unknown error"));
      }
      return;
    }
    case "pin_session": {
      const pinData: SessionData = {
        name: "__pinned__",
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
      try {
        await saveSession(pinData);
      } catch {
        alert("Failed to pin session.");
      }
      return;
    }
    case "share_link": {
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
      return;
    }
    case "stop_all":
      engine.stopAll();
      return;
    case "play_all":
      engine.playAll();
      return;
    case "state_sync":
      // Purely a React-side concern — no engine effect
      return;
  }
}
