import { describe, it, expect, vi, afterEach } from "vitest";
import { PadEngine } from "../engine/PadEngine";

// Mock the Recorder so pad recording flows run without a mic.
vi.mock("../engine/Recorder", () => ({
  Recorder: class {
    async start(): Promise<void> {}
    stop(): Promise<Float32Array> {
      return Promise.resolve(new Float32Array(500).fill(0.5));
    }
  },
}));

// Mock localStorage for Node environment (same pattern as recordingLimits.test.ts)
const storage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
  },
  writable: true,
});

// The count-in click ramps gain — the stub GainNode lacks the ramp/schedule
// methods, so add them (no-ops; we never assert on click audio).
const ACGain = window.AudioContext as unknown as {
  prototype: { createGain: () => { gain: Record<string, unknown> } };
};
const origCreateGain = ACGain.prototype.createGain;
ACGain.prototype.createGain = function () {
  const node = origCreateGain.call(this);
  node.gain.setValueAtTime ??= () => {};
  node.gain.exponentialRampToValueAtTime ??= () => {};
  node.gain.setTargetAtTime ??= () => {};
  return node;
};

// playClick chains osc.connect(gain).connect(master) — the stub's connect
// returns undefined, so make the oscillator's connect return its argument.
const ACOsc = window.AudioContext as unknown as {
  prototype: { createOscillator: () => Record<string, unknown> };
};
const origCreateOsc = ACOsc.prototype.createOscillator;
ACOsc.prototype.createOscillator = function () {
  const node = origCreateOsc.call(this);
  node.connect = (target: unknown) => target;
  return node;
};

function makePads() {
  const ctx = new (window.AudioContext as unknown as { new (): AudioContext })();
  return { ctx, pads: new PadEngine(ctx, ctx.createGain(), ctx.createGain()) };
}

afterEach(() => {
  localStorage.removeItem("mloop-recording-limits");
  vi.useRealTimers();
});

describe("recording length cap", () => {
  it("auto-stops a pad recording at the configured limit", async () => {
    vi.useFakeTimers();
    localStorage.setItem("mloop-recording-limits", JSON.stringify({ maxRecordingTimeSec: 1 }));
    const { pads } = makePads();
    pads.countInBeats = 0;

    await pads.startRecording(3);
    expect(pads.slots[3].status).toBe("recording");

    await vi.advanceTimersByTimeAsync(1100);
    expect(pads.slots[3].status).toBe("loaded");
  });
});

describe("count-in arming guard", () => {
  it("ignores a second record tap while a count-in is running", async () => {
    const { pads } = makePads();
    pads.countInBeats = 4;
    await pads.startRecording(0);
    expect(pads.slots[0].status).toBe("recording"); // armed, counting in

    await pads.startRecording(1);
    // Second tap must not arm another slot / spawn another recorder
    expect(pads.slots[1].status).toBe("empty");
  });

  it("cancelCountIn releases the guard and resets the armed slot", async () => {
    const { pads } = makePads();
    pads.countInBeats = 4;
    await pads.startRecording(0);

    pads.cancelCountIn();
    expect(pads.slots[0].status).toBe("empty");

    await pads.startRecording(1);
    expect(pads.slots[1].status).toBe("recording");
  });
});

describe("stopResample failure handling", () => {
  it("resets resample state when decoding fails", async () => {
    const { ctx, pads } = makePads();
    // jsdom has no MediaStream; the stub destination only needs a .stream
    vi.spyOn(ctx, "createMediaStreamDestination").mockImplementation(
      () => ({ stream: {} } as unknown as MediaStreamAudioDestinationNode),
    );
    (ctx as unknown as { decodeAudioData: () => Promise<AudioBuffer> }).decodeAudioData =
      () => Promise.reject(new Error("decode failed"));

    pads.startResample(2);
    expect(pads.isResampling).toBe(true);

    await pads.stopResample();
    expect(pads.isResampling).toBe(false);
  });
});

describe("hasContent", () => {
  it("is false for a pristine engine, true once the grid has a step", () => {
    const { pads } = makePads();
    expect(pads.hasContent).toBe(false);

    const grid = Array.from({ length: 64 }, () => Array(16).fill(false));
    grid[0][0] = true;
    pads.setSeqGrid(grid);
    expect(pads.hasContent).toBe(true);
  });

  it("is true once a pad has a sample", () => {
    const { pads } = makePads();
    pads.importBuffer(0, new Float32Array(100).fill(0.1), "kick");
    expect(pads.hasContent).toBe(true);
  });
});
