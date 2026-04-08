import { describe, it, expect } from "vitest";
import { loopEngineReducer } from "../hooks/loopEngineReducer";
import { createInitialState } from "../types";
import type { EngineState } from "../types";

function withTrack(overrides: Partial<EngineState["tracks"][number]>, trackId = 0): EngineState {
  const state = createInitialState();
  state.tracks[trackId] = { ...state.tracks[trackId], ...overrides };
  return state;
}

describe("loopEngineReducer", () => {
  it("track_record moves target track to recording, leaves others alone", () => {
    const s = createInitialState();
    const next = loopEngineReducer(s, { type: "track_record", trackId: 1 });
    expect(next.tracks[1].status).toBe("recording");
    expect(next.tracks[0].status).toBe("empty");
    expect(next.tracks[2].status).toBe("empty");
  });

  it("track_stop with layers > 0 goes to stopped; with 0 layers goes to empty", () => {
    const withLayers = withTrack({ layers: 2, status: "playing" });
    const stopped = loopEngineReducer(withLayers, { type: "track_stop", trackId: 0 });
    expect(stopped.tracks[0].status).toBe("stopped");

    const empty = loopEngineReducer(createInitialState(), { type: "track_stop", trackId: 0 });
    expect(empty.tracks[0].status).toBe("empty");
  });

  it("track_clear resets track but leaves engine-wide state intact", () => {
    const s = withTrack({ layers: 3, status: "playing", isReversed: true, playbackRate: 0.5, loopLengthSamples: 44100 });
    const next = loopEngineReducer({ ...s, bpm: 140 }, { type: "track_clear", trackId: 0 });
    expect(next.tracks[0]).toMatchObject({
      status: "empty",
      layers: 0,
      isReversed: false,
      playbackRate: 1,
      loopLengthSamples: 0,
    });
    expect(next.bpm).toBe(140);
  });

  it("track_undo decrements layers, switches to empty at zero", () => {
    const s = withTrack({ layers: 1, status: "playing" });
    const after = loopEngineReducer(s, { type: "track_undo", trackId: 0 });
    expect(after.tracks[0].layers).toBe(0);
    expect(after.tracks[0].status).toBe("empty");

    const twoLayers = withTrack({ layers: 2, status: "playing" });
    const afterTwo = loopEngineReducer(twoLayers, { type: "track_undo", trackId: 0 });
    expect(afterTwo.tracks[0].layers).toBe(1);
    expect(afterTwo.tracks[0].status).toBe("playing");
  });

  it("track_mute toggles mute", () => {
    const s = createInitialState();
    const muted = loopEngineReducer(s, { type: "track_mute", trackId: 0 });
    expect(muted.tracks[0].muted).toBe(true);
    const unmuted = loopEngineReducer(muted, { type: "track_mute", trackId: 0 });
    expect(unmuted.tracks[0].muted).toBe(false);
  });

  it("track_reverse and track_half_speed toggle flags", () => {
    const s = withTrack({ layers: 1 });
    const rev = loopEngineReducer(s, { type: "track_reverse", trackId: 0 });
    expect(rev.tracks[0].isReversed).toBe(true);

    const half = loopEngineReducer(s, { type: "track_half_speed", trackId: 0 });
    expect(half.tracks[0].playbackRate).toBe(0.5);
    const full = loopEngineReducer(half, { type: "track_half_speed", trackId: 0 });
    expect(full.tracks[0].playbackRate).toBe(1);
  });

  it("set_volume / set_bpm / timing / sync modes update engine-level fields", () => {
    const s = createInitialState();
    expect(loopEngineReducer(s, { type: "set_volume", trackId: 0, volume: 0.25 }).tracks[0].volume).toBe(0.25);
    expect(loopEngineReducer(s, { type: "set_bpm", bpm: 150 }).bpm).toBe(150);
    expect(loopEngineReducer(s, { type: "set_timing_mode", mode: "quantized" }).timingMode).toBe("quantized");
    expect(loopEngineReducer(s, { type: "set_sync_mode", mode: "lock" }).syncMode).toBe("lock");
    expect(loopEngineReducer(s, { type: "toggle_metronome" }).metronome).toBe(true);
  });

  it("stop_all / play_all respect track layer state", () => {
    const s = createInitialState();
    s.tracks[0] = { ...s.tracks[0], layers: 1, status: "recording" };
    s.tracks[1] = { ...s.tracks[1], layers: 0 }; // empty — should stay empty
    s.tracks[2] = { ...s.tracks[2], layers: 2, status: "playing" };

    const stopped = loopEngineReducer(s, { type: "stop_all" });
    expect(stopped.tracks[0].status).toBe("stopped");
    expect(stopped.tracks[1].status).toBe("empty");
    expect(stopped.tracks[2].status).toBe("stopped");

    const played = loopEngineReducer(stopped, { type: "play_all" });
    expect(played.tracks[0].status).toBe("playing");
    expect(played.tracks[1].status).toBe("empty"); // still no layers
    expect(played.tracks[2].status).toBe("playing");
  });

  it("state_sync merges partial engine snapshot on top of existing state", () => {
    const s = createInitialState();
    const next = loopEngineReducer(s, { type: "state_sync", state: { bpm: 90, started: true } });
    expect(next.bpm).toBe(90);
    expect(next.started).toBe(true);
    expect(next.tracks.length).toBe(3); // untouched
  });
});
