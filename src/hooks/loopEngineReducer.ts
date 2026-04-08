/**
 * Pure reducer + engine→React sync helper for useLoopEngine.
 *
 * Extracted so it can be unit tested without spinning up an AudioContext
 * or mocking the entire engine. The reducer produces optimistic UI
 * updates; `syncFromEngine` produces an authoritative snapshot from the
 * real engine after async operations complete.
 */

import type { EngineState, LoopCommand, TrackState } from "../types";
import type { AudioEngine } from "../engine/AudioEngine";

/** Helper to immutably update a single track within the state. */
function updateTrack(state: EngineState, trackId: number, update: Partial<TrackState>): EngineState {
  return {
    ...state,
    tracks: state.tracks.map((t) =>
      t.id === trackId ? { ...t, ...update } : t
    ),
  };
}

/**
 * Pure reducer for optimistic UI updates.
 * Each command type maps to the expected state change before the
 * async engine operation confirms the real outcome.
 */
export function loopEngineReducer(state: EngineState, cmd: LoopCommand): EngineState {
  switch (cmd.type) {
    case "track_record":
      return updateTrack(state, cmd.trackId, { status: "recording" });

    case "track_stop":
      return updateTrack(state, cmd.trackId, {
        status: state.tracks[cmd.trackId].layers > 0 ? "stopped" : "empty",
      });

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
          status: t.layers > 0 ? ("stopped" as const) : ("empty" as const),
        })),
      };

    case "play_all":
      return {
        ...state,
        tracks: state.tracks.map((t) => ({
          ...t,
          status: t.layers > 0 ? ("playing" as const) : t.status,
        })),
      };

    // Engine-authoritative sync — overwrites optimistic state with real values
    case "state_sync":
      return { ...state, ...cmd.state };

    default:
      return state;
  }
}

/** Read the real audio engine state and produce a React-compatible snapshot. */
export function syncFromEngine(engine: AudioEngine): Partial<EngineState> {
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
