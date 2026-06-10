import { describe, it, expect } from "vitest";
import { TimingEngine } from "../engine/TimingEngine";

function makeTiming() {
  const ctx = new (window.AudioContext as unknown as { new (): AudioContext })();
  const timing = new TimingEngine(ctx, ctx.createGain());
  return { ctx, timing };
}

describe("getNextBarBoundary", () => {
  it("returns the next downbeat time on the beat grid, not relative to now", () => {
    const { timing } = makeTiming();
    timing.bpm = 120; // beat = 0.5s, bar = 2s

    // start() at t=0 schedules beat 0 immediately (look-ahead), so the
    // next unscheduled beat is #1 at 0.5s and the next bar starts at 2.0s.
    timing.start();
    expect(timing.getNextBarBoundary()).toBeCloseTo(2.0, 6);
    timing.stop();
  });

  it("returns current time when the scheduler is not running", () => {
    const { ctx, timing } = makeTiming();
    expect(timing.getNextBarBoundary()).toBe(ctx.currentTime);
  });
});
