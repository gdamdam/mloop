import { describe, it, expect } from "vitest";
import { createInitialState, NUM_TRACKS } from "../types";

describe("createInitialState", () => {
  it("returns an EngineState with started = false", () => {
    const state = createInitialState();
    expect(state.started).toBe(false);
  });

  it("creates correct number of tracks", () => {
    const state = createInitialState();
    expect(state.tracks.length).toBe(NUM_TRACKS);
    expect(state.tracks.length).toBe(3);
  });

  it("each track has correct initial values", () => {
    const state = createInitialState();
    for (let i = 0; i < state.tracks.length; i++) {
      const track = state.tracks[i];
      expect(track.id).toBe(i);
      expect(track.status).toBe("empty");
      expect(track.volume).toBe(0.8);
      expect(track.muted).toBe(false);
      expect(track.layers).toBe(0);
      expect(track.loopLengthSamples).toBe(0);
      expect(track.isReversed).toBe(false);
      expect(track.playbackRate).toBe(1);
    }
  });

  it("has correct global defaults", () => {
    const state = createInitialState();
    expect(state.masterLoopLength).toBeNull();
    expect(state.bpm).toBe(120);
    expect(state.timingMode).toBe("free");
    expect(state.syncMode).toBe("free");
    expect(state.metronome).toBe(false);
    expect(state.inputLevel).toBe(0);
  });

  it("returns a fresh object each call (no shared state)", () => {
    const a = createInitialState();
    const b = createInitialState();
    expect(a).not.toBe(b);
    expect(a.tracks).not.toBe(b.tracks);
    // Mutating one should not affect the other
    a.bpm = 200;
    a.tracks[0].status = "playing";
    expect(b.bpm).toBe(120);
    expect(b.tracks[0].status).toBe("empty");
  });
});
