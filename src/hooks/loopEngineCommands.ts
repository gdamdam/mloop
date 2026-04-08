/**
 * Async command runner for the loop engine.
 *
 * Takes a LoopCommand and runs the corresponding mutation on the
 * AudioEngine. Persistence and file I/O handlers live in
 * `loopEnginePersistence.ts`; this module is only engine mutations.
 *
 * Extracted from useLoopEngine so the hook body stays focused on
 * React wiring, not side effects.
 */

import type { LoopCommand } from "../types";
import type { AudioEngine } from "../engine/AudioEngine";
import {
  handleSaveSession,
  handleLoadSession,
  handleExportWav,
  handleExportSessionFile,
  handleImportSessionFile,
  handlePinSession,
  handleShareLink,
} from "./loopEnginePersistence";

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
 * errors (session save, file I/O) are handled with alerts inside the
 * persistence helpers.
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
    case "save_session":
      return handleSaveSession(engine, cmd.name);
    case "load_session":
      return handleLoadSession(engine, cmd.name);
    case "export_wav":
      return handleExportWav(engine);
    case "export_session_file":
      return handleExportSessionFile(engine);
    case "import_session_file":
      return handleImportSessionFile(engine);
    case "pin_session":
      return handlePinSession(engine);
    case "share_link":
      return handleShareLink(engine);
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
