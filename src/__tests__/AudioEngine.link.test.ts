import { describe, it, expect, vi, afterEach } from "vitest";
import { AudioEngine } from "../engine/AudioEngine";
import { nowMs, type LinkClock } from "../utils/linkBridge";

// The shared StubAudioContext returns biquad filters without a `gain`
// AudioParam, but AudioEngine's master EQ sets `eqLow.gain.value`. Augment the
// stub here (additive, same pattern as AudioEngine.test.ts) so it constructs.
const AC = window.AudioContext as unknown as {
  prototype: { createBiquadFilter: () => Record<string, unknown> };
};
const origCreateBiquad = AC.prototype.createBiquadFilter;
AC.prototype.createBiquadFilter = function () {
  const node = origCreateBiquad.call(this) as Record<string, unknown>;
  if (!node.gain) node.gain = { value: 0, setTargetAtTime: () => {} };
  return node;
};

let engine: AudioEngine | null = null;
afterEach(() => { engine?.shutdown(); engine = null; vi.restoreAllMocks(); });

/** Give the engine a 2-second master loop and make track 0 look non-empty. */
function withLoop(e: AudioEngine) {
  (e as unknown as { masterLoopLength: number }).masterLoopLength = e.ctx.sampleRate * 2; // 2s
  const t0 = e.tracks[0];
  Object.defineProperty(t0, "layerCount", { get: () => 1, configurable: true });
  return vi.spyOn(t0, "play").mockImplementation(() => {});
}

const setTime = (e: AudioEngine, t: number) =>
  ((e.ctx as unknown as { currentTime: number }).currentTime = t);
const masterStart = (e: AudioEngine) => (e as unknown as { masterStartTime: number }).masterStartTime;

describe("AudioEngine — Link-aligned looper start", () => {
  it("starts an existing loop at the shared-phase offset (correct loop offset)", () => {
    engine = new AudioEngine();
    const playSpy = withLoop(engine);
    setTime(engine, 10);
    // Shared position: beat 2 @120bpm → 2 * 0.5s = 1.0s into a 2s loop.
    const clock: LinkClock = { tempo: 120, beat: 2, phase: 2, receivedAt: nowMs() };
    engine.setLinkClock(clock);

    engine.playAll();

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy.mock.calls[0][0]).toBeCloseTo(1.0, 2); // loop offset
    // Master clock anchored so getMasterOffset stays consistent (now - offset).
    expect(masterStart(engine)).toBeCloseTo(9.0, 2);
  });

  it("keeps fractional Link tempo in the offset math", () => {
    engine = new AudioEngine();
    const playSpy = withLoop(engine);
    setTime(engine, 0);
    // 90 BPM, beat 3 → 3 * (60/90) = 2.0s → into a 2s loop → offset 0.
    engine.setLinkClock({ tempo: 90, beat: 3, phase: 0, receivedAt: nowMs() });
    engine.playAll();
    expect(playSpy.mock.calls[0][0]).toBeCloseTo(0.0, 2);
  });
});

describe("AudioEngine — disconnected (no Link clock)", () => {
  it("falls back to standalone free-mode behavior (offset 0), unchanged", () => {
    engine = new AudioEngine();
    const playSpy = withLoop(engine);
    engine.setLinkClock(null);
    // default syncMode is "free"
    engine.playAll();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy.mock.calls[0][0]).toBe(0);
  });
});
