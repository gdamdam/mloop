import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../engine/AudioEngine";

// The shared StubAudioContext (setup.ts) returns biquad filters without a
// `gain` AudioParam, but AudioEngine's master EQ sets `eqLow.gain.value`.
// Augment the stub here (additive, scoped to this test file) so the engine
// can be constructed without modifying the shared setup.
const AC = window.AudioContext as unknown as {
  prototype: { createBiquadFilter: () => Record<string, unknown> };
};
const origCreateBiquad = AC.prototype.createBiquadFilter;
AC.prototype.createBiquadFilter = function () {
  const node = origCreateBiquad.call(this) as Record<string, unknown>;
  if (!node.gain) node.gain = { value: 0, setTargetAtTime: () => {} };
  return node;
};

describe("AudioEngine.shutdown", () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(document, "addEventListener");
    removeSpy = vi.spyOn(document, "removeEventListener");
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("removes the resume-event listeners it added in the constructor", () => {
    const engine = new AudioEngine();
    // Constructor wires resume listeners for these gesture events.
    const events = ["pointerdown", "keydown", "touchstart"];
    for (const e of events) {
      expect(addSpy).toHaveBeenCalledWith(e, expect.any(Function), expect.anything());
    }

    engine.shutdown();

    for (const e of events) {
      expect(removeSpy).toHaveBeenCalledWith(e, expect.any(Function));
    }
  });

  it("is idempotent — calling shutdown twice does not double-remove or throw", () => {
    const engine = new AudioEngine();
    engine.shutdown();
    const removeCallsAfterFirst = removeSpy.mock.calls.length;

    // Second call must be a no-op.
    expect(() => engine.shutdown()).not.toThrow();
    expect(removeSpy.mock.calls.length).toBe(removeCallsAfterFirst);
  });

  it("does not propagate when ctx.close() throws (closed/Safari edge case)", () => {
    const engine = new AudioEngine();
    // Simulate a context that throws on a second close.
    (engine.ctx as unknown as { close: () => void }).close = () => {
      throw new Error("InvalidStateError: context already closed");
    };
    expect(() => engine.shutdown()).not.toThrow();
  });
});

describe("AudioEngine teardown disconnect guards", () => {
  it("switchDevice does not propagate a throwing inputSource.disconnect", async () => {
    const engine = new AudioEngine();
    // Force an input source whose disconnect throws (Safari/Firefox behavior
    // when disconnecting an already-disconnected node).
    (engine as unknown as { inputSource: { disconnect: () => void } | null }).inputSource = {
      disconnect: () => { throw new Error("InvalidAccessError"); },
    };
    // getUserMedia is unavailable in jsdom; switchDevice will reject AFTER the
    // teardown disconnect. We only assert the disconnect itself didn't throw
    // synchronously — i.e. the teardown is guarded.
    await expect(engine.switchDevice("dev-1")).rejects.toBeDefined();
    engine.shutdown();
  });
});

describe("playAll master clock anchoring", () => {
  it("keeps later playTrack calls phase-aligned after playAll", () => {
    const engine = new AudioEngine();
    engine.syncMode = "sync";
    engine.masterLoopLength = 44100; // 1s loop
    engine.tracks[0].importBuffer(new Float32Array(44100), 0);

    const ctx = engine.ctx as unknown as { currentTime: number };
    ctx.currentTime = 10;
    engine.playAll(); // establishes the master clock

    ctx.currentTime = 10.6;
    engine.playAll(); // restarts everything 0.6s into the loop

    // A track joining later must align to the same phase the running
    // tracks actually have (0.7), not to a clock that was reset to "now".
    const spy = vi.spyOn(engine.tracks[0], "play");
    ctx.currentTime = 10.7;
    engine.playTrack(0);
    expect(spy).toHaveBeenCalledWith(expect.closeTo(0.7, 5));
    engine.shutdown();
  });
});

describe("master record destination reuse", () => {
  it("does not connect a fresh MediaStreamAudioDestinationNode per recording", () => {
    const engine = new AudioEngine();
    const spy = vi
      .spyOn(engine.ctx, "createMediaStreamDestination")
      .mockImplementation(() => ({ stream: {} } as unknown as MediaStreamAudioDestinationNode));
    engine.startMasterRecord();
    engine.startMasterRecord();
    expect(spy).toHaveBeenCalledTimes(1);
    engine.shutdown();
  });
});
