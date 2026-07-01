import { describe, it, expect, vi, afterEach } from "vitest";
import { PadEngine } from "../engine/PadEngine";
import { nowMs, type LinkClock } from "../utils/linkBridge";

// Recorder isn't exercised by the sequencer paths, but PadEngine imports it —
// mock it so the module graph loads without worklet/mic dependencies.
vi.mock("../engine/Recorder", () => ({
  Recorder: class { async start(): Promise<void> {} stop(): Promise<Float32Array> { return Promise.resolve(new Float32Array()); } },
}));

function makePads() {
  const ctx = new (window.AudioContext as unknown as { new (): AudioContext })();
  const pads = new PadEngine(ctx, ctx.createGain(), ctx.createGain());
  // All-on 16-step grid triggering pad 0 so every step would fire a note.
  const grid = Array.from({ length: 16 }, () => Array(16).fill(false));
  for (let s = 0; s < 16; s++) grid[s][0] = true;
  pads.setSeqGrid(grid);
  pads.setSeqBpm(120); // 16th = 60/120/4 = 0.125s
  return { ctx, pads };
}

// Convenience accessors for the private scheduler fields.
const seqNextStepTime = (p: PadEngine) => (p as unknown as { seqNextStepTime: number }).seqNextStepTime;
const seqStepIndex = (p: PadEngine) => (p as unknown as { seqStepIndex: number }).seqStepIndex;
const runSchedule = (p: PadEngine) => (p as unknown as { seqSchedule: () => void }).seqSchedule();

afterEach(() => vi.restoreAllMocks());

describe("PadEngine — disconnected (no Link clock)", () => {
  it("starts the sequencer immediately, unchanged from standalone behavior", () => {
    const { ctx, pads } = makePads();
    const spy = vi.spyOn(pads, "playAt").mockImplementation(() => {});
    (ctx as unknown as { currentTime: number }).currentTime = 3.0;
    pads.startSequencer();
    pads.stopSequencer();
    // Step 0 fired immediately at currentTime, and the grid advanced.
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][1]).toBeCloseTo(3.0, 6); // `when` == currentTime
    expect(seqNextStepTime(pads)).toBeCloseTo(3.125, 6);
  });
});

describe("PadEngine — Link-aligned start", () => {
  it("connect/remote-start anchors step 0 to the next shared bar (no immediate note)", () => {
    const { ctx, pads } = makePads();
    (ctx as unknown as { currentTime: number }).currentTime = 5.0;
    const linkClock: LinkClock = { tempo: 120, beat: 0, phase: 1, receivedAt: nowMs() };
    pads.setLinkClock(linkClock);
    const spy = vi.spyOn(pads, "playAt").mockImplementation(() => {});
    pads.startSequencer();
    pads.stopSequencer();
    // phase 1 of 4 @120bpm → 3 beats to bar → 1.5s → step 0 at ctx 6.5s.
    expect(seqNextStepTime(pads)).toBeCloseTo(6.5, 1);
    // 6.5s is well beyond the 0.1s lookahead from 5.0s → nothing fired yet.
    expect(spy).not.toHaveBeenCalled();
    expect(seqStepIndex(pads)).toBe(0);
  });
});

describe("PadEngine — forward drift correction (no catch-up burst)", () => {
  it("skips missed steps silently after a clock jump instead of stacking notes", () => {
    const { ctx, pads } = makePads();
    const setTime = (t: number) => { (ctx as unknown as { currentTime: number }).currentTime = t; };
    const spy = vi.spyOn(pads, "playAt").mockImplementation(() => {});

    setTime(0);
    pads.startSequencer();  // schedules step 0 @0, advances to step 1 @0.125
    pads.stopSequencer();   // stop the interval; we drive seqSchedule manually
    const afterStart = spy.mock.calls.length;
    const stepAfterStart = seqStepIndex(pads);
    expect(afterStart).toBe(1);
    expect(stepAfterStart).toBe(1);

    // Simulate a 1-second stall: the audio clock jumps forward. A naive
    // `while (nextStepTime < horizon)` would fire ~8 stacked past-dated notes.
    setTime(1.0);
    runSchedule(pads);

    const newCalls = spy.mock.calls.length - afterStart;
    // Only the step landing at/after (now - tolerance) is scheduled — one note,
    // not a burst. The 7 missed steps are dropped.
    expect(newCalls).toBe(1);
    expect(spy.mock.calls[spy.mock.calls.length - 1][1]).toBeCloseTo(1.0, 3);
    // The step index jumped forward past all the skipped steps.
    expect(seqStepIndex(pads)).toBe(9);
  });
});

describe("PadEngine — remote-stop voice flush", () => {
  it("flushVoices stops and clears every ringing source", () => {
    const { pads } = makePads();
    const src = { stop: vi.fn(), disconnect: vi.fn() };
    const active = (pads as unknown as { activeSources: Map<number, Set<unknown>> }).activeSources;
    active.set(0, new Set([src]));
    pads.flushVoices();
    expect(src.stop).toHaveBeenCalled();
    expect(active.size).toBe(0);
  });
});
