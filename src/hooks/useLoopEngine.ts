import { useReducer, useRef, useCallback } from "react";
import type { EngineState, LoopCommand, TrackState } from "../types";
import { createInitialState } from "../types";
import { AudioEngine } from "../engine/AudioEngine";
import { saveSession, loadSession } from "../utils/storage";
import type { SessionData } from "../utils/storage";
import { encodeWav } from "../utils/wav";
import { mixBuffers } from "../utils/bufferOps";
import { saveFileAs, openFile } from "../utils/fileExport";
import { encodeShareLink } from "../utils/shareLink";

// ── Reducer ──────────────────────────────────────────────────────────────

function updateTrack(state: EngineState, trackId: number, update: Partial<TrackState>): EngineState {
  return {
    ...state,
    tracks: state.tracks.map((t) =>
      t.id === trackId ? { ...t, ...update } : t
    ),
  };
}

function reducer(state: EngineState, cmd: LoopCommand): EngineState {
  switch (cmd.type) {
    case "track_record":
      return updateTrack(state, cmd.trackId, { status: "recording" });

    case "track_stop":
      return updateTrack(state, cmd.trackId, { status: state.tracks[cmd.trackId].layers > 0 ? "stopped" : "empty" });

    case "track_play":
      return updateTrack(state, cmd.trackId, { status: "playing" });

    case "track_overdub":
      return updateTrack(state, cmd.trackId, { status: "overdubbing" });

    case "track_mute": {
      const track = state.tracks[cmd.trackId];
      return updateTrack(state, cmd.trackId, { muted: !track.muted });
    }

    case "track_clear":
      return updateTrack(state, cmd.trackId, {
        status: "empty",
        layers: 0,
        loopLengthSamples: 0,
        isReversed: false,
        playbackRate: 1,
      });

    case "track_undo": {
      const track = state.tracks[cmd.trackId];
      const newLayers = Math.max(0, track.layers - 1);
      return updateTrack(state, cmd.trackId, {
        layers: newLayers,
        status: newLayers === 0 ? "empty" : track.status,
      });
    }

    case "track_reverse": {
      const track = state.tracks[cmd.trackId];
      return updateTrack(state, cmd.trackId, { isReversed: !track.isReversed });
    }

    case "track_half_speed": {
      const track = state.tracks[cmd.trackId];
      return updateTrack(state, cmd.trackId, {
        playbackRate: track.playbackRate === 1 ? 0.5 : 1,
      });
    }

    case "set_volume":
      return updateTrack(state, cmd.trackId, { volume: cmd.volume });

    case "set_bpm":
      return { ...state, bpm: cmd.bpm };

    case "set_timing_mode":
      return { ...state, timingMode: cmd.mode };

    case "set_sync_mode":
      return { ...state, syncMode: cmd.mode };

    case "toggle_metronome":
      return { ...state, metronome: !state.metronome };

    case "stop_all":
      return {
        ...state,
        tracks: state.tracks.map((t) => ({
          ...t,
          status: t.layers > 0 ? "stopped" as const : "empty" as const,
        })),
      };

    case "play_all":
      return {
        ...state,
        tracks: state.tracks.map((t) => ({
          ...t,
          status: t.layers > 0 ? "playing" as const : t.status,
        })),
      };

    case "state_sync":
      return { ...state, ...cmd.state };

    default:
      return state;
  }
}

// ── Sync engine state → React state ──────────────────────────────────────

function syncFromEngine(engine: AudioEngine): Partial<EngineState> {
  return {
    masterLoopLength: engine.masterLoopLength,
    bpm: engine.timing.bpm,
    timingMode: engine.timingMode,
    syncMode: engine.syncMode,
    metronome: engine.timing.metronomeOn,
    tracks: engine.tracks.map((t) => ({
      id: t.id,
      status: t.status,
      volume: t.volume,
      muted: t.muted,
      layers: t.layerCount,
      loopLengthSamples: t.loopLengthSamples,
      isReversed: t.isReversed,
      playbackRate: t.playbackRate,
    })),
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useLoopEngine() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const engineRef = useRef<AudioEngine | null>(null);

  const syncState = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    dispatch({ type: "state_sync", state: syncFromEngine(engine) });
  }, []);

  const command = useCallback((cmd: LoopCommand) => {
    const engine = engineRef.current;

    // Optimistic UI update
    dispatch(cmd);

    if (!engine) return;

    // Dispatch to real engine, then sync back
    const run = async () => {
      switch (cmd.type) {
        case "track_record":
          await engine.recordTrack(cmd.trackId);
          break;
        case "track_stop":
          await engine.stopTrack(cmd.trackId);
          break;
        case "track_play":
          engine.playTrack(cmd.trackId);
          break;
        case "track_overdub":
          await engine.overdubTrack(cmd.trackId);
          break;
        case "track_mute": {
          const track = engine.tracks[cmd.trackId];
          track.muted = !track.muted;
          break;
        }
        case "track_clear":
          engine.clearTrack(cmd.trackId);
          break;
        case "track_undo":
          engine.tracks[cmd.trackId]?.undoLastLayer();
          break;
        case "track_reverse":
          engine.tracks[cmd.trackId]?.toggleReverse();
          break;
        case "track_half_speed":
          engine.tracks[cmd.trackId]?.toggleHalfSpeed();
          break;
        case "set_volume":
          engine.tracks[cmd.trackId].volume = cmd.volume;
          break;
        case "set_bpm":
          engine.setBpm(cmd.bpm);
          break;
        case "set_timing_mode":
          engine.setTimingMode(cmd.mode);
          break;
        case "set_sync_mode":
          engine.syncMode = cmd.mode;
          break;
        case "toggle_metronome":
          engine.toggleMetronome();
          break;
        case "tap_tempo":
          engine.tapTempo();
          break;
        case "track_toggle_effect": {
          const fx = engine.tracks[cmd.trackId]?.getEffects();
          if (fx) {
            const current = fx[cmd.name].on;
            engine.tracks[cmd.trackId].setEffect(cmd.name, { on: !current } as never);
          }
          break;
        }
        case "track_set_effect":
          engine.tracks[cmd.trackId]?.setEffect(cmd.name, cmd.params as never);
          break;
        case "import_file": {
          const track = engine.tracks[cmd.trackId];
          const len = track.importBuffer(cmd.buffer, engine.masterLoopLength);
          if (engine.masterLoopLength === 0 && len > 0) {
            engine.masterLoopLength = len;
          }
          break;
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
          break;
        }
        case "load_session": {
          const session = await loadSession(cmd.name);
          if (!session) break;
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
          break;
        }
        case "export_wav": {
          // Mix all non-empty tracks and save via system Save As dialog
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
            const wav = encodeWav(mixed, engine.ctx.sampleRate);
            await saveFileAs(new Blob([wav], { type: "audio/wav" }), "mloop-mixdown.wav");
          }
          break;
        }
        case "export_session_file": {
          // Serialize full session state to JSON + audio buffers, save via Save As
          const sessionExport = {
            version: 1,
            bpm: engine.timing.bpm,
            timingMode: engine.timingMode,
            syncMode: engine.syncMode,
            masterLoopLength: engine.masterLoopLength,
            tracks: engine.tracks.map((t) => ({
              layers: t.getLayers().map((l) => Array.from(l)), // Float32 → number[]
              volume: t.volume,
              isReversed: t.isReversed,
              playbackRate: t.playbackRate,
              loopLengthSamples: t.loopLengthSamples,
            })),
          };
          const json = JSON.stringify(sessionExport);
          await saveFileAs(new Blob([json], { type: "application/json" }), "mloop-session.json");
          break;
        }
        case "import_session_file": {
          // Open file picker, load JSON session, restore all state
          const file = await openFile(".json");
          if (!file) break;
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
          break;
        }
        case "pin_session": {
          // Quick-save current state as pinned session (auto-loads on next visit)
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
          break;
        }
        case "share_link": {
          // Generate a shareable URL with current settings (no audio — too large)
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
            // Fallback: show in prompt
            prompt("Share this link:", url);
          }
          break;
        }
        case "stop_all":
          engine.stopAll();
          break;
        case "play_all":
          engine.playAll();
          break;
        default:
          break;
      }
      // Sync real engine state back to React
      syncState();
    };

    run();
  }, [syncState]);

  const startEngine = useCallback(async () => {
    if (engineRef.current) return;

    const engine = new AudioEngine();
    await engine.initMic();

    // Wire track state change callbacks to sync React state
    for (const track of engine.tracks) {
      track.onStateChange = () => {
        dispatch({ type: "state_sync", state: syncFromEngine(engine) });
      };
    }

    engineRef.current = engine;
    dispatch({ type: "state_sync", state: { started: true, ...syncFromEngine(engine) } });

    // Auto-load pinned session if one exists
    try {
      const pinned = await loadSession("__pinned__");
      if (pinned && pinned.tracks.some(t => t.layers.length > 0)) {
        engine.masterLoopLength = pinned.masterLoopLength;
        engine.timing.bpm = pinned.bpm;
        engine.timingMode = pinned.timingMode;
        for (let i = 0; i < engine.tracks.length; i++) {
          const td = pinned.tracks[i];
          if (!td || td.layers.length === 0) continue;
          const layers = td.layers.map((ab) => new Float32Array(ab));
          engine.tracks[i].restoreLayers(layers, td.loopLengthSamples);
          engine.tracks[i].volume = td.volume;
        }
        dispatch({ type: "state_sync", state: syncFromEngine(engine) });
      }
    } catch { /* no pinned session or corrupt — skip silently */ }
  }, []);

  const getEngine = useCallback(() => engineRef.current, []);

  return { state, command, startEngine, getEngine };
}
