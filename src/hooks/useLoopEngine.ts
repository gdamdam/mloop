import { useReducer, useRef, useCallback } from "react";
import type { EngineState, LoopCommand, TrackState } from "../types";
import { createInitialState } from "../types";
import { AudioEngine } from "../engine/AudioEngine";
import { saveSession, loadSession } from "../utils/storage";
import type { SessionData } from "../utils/storage";
import { encodeWav, downloadBlob } from "../utils/wav";
import { mixBuffers } from "../utils/bufferOps";

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
          saveSession(session);
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
          // Mix all tracks into one buffer and download
          const bufs: Float32Array[] = [];
          for (const t of engine.tracks) {
            const data = t.getMixedData();
            if (data) bufs.push(data);
          }
          if (bufs.length > 0) {
            // Pad shorter buffers to longest
            const maxLen = Math.max(...bufs.map((b) => b.length));
            const padded = bufs.map((b) => {
              if (b.length === maxLen) return b;
              const p = new Float32Array(maxLen);
              p.set(b);
              return p;
            });
            const mixed = mixBuffers(padded);
            const wav = encodeWav(mixed, engine.ctx.sampleRate);
            downloadBlob(wav, "mloop-mixdown.wav");
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
  }, []);

  const getEngine = useCallback(() => engineRef.current, []);

  return { state, command, startEngine, getEngine };
}
