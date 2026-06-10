import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  mockRec.stopImpl = null;
});

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
import { AudioEngine } from "../engine/AudioEngine";
import { LoopTrack } from "../engine/LoopTrack";

// Mock the Recorder so recording flows run without a mic or AudioWorklet.
// stop() resolves with whatever buffer the test put in `mockRec.data`.
const mockRec = vi.hoisted(() => ({
  data: new Float32Array(0),
  stopImpl: null as (() => Promise<Float32Array>) | null,
}));
vi.mock("../engine/Recorder", () => ({
  Recorder: class {
    async start(): Promise<void> {}
    stop(): Promise<Float32Array> {
      return mockRec.stopImpl ? mockRec.stopImpl() : Promise.resolve(mockRec.data);
    }
  },
}));

// The shared StubAudioContext (setup.ts) returns biquad filters without a
// `gain` AudioParam, but AudioEngine's master EQ sets `eqLow.gain.value`.
// Augment the stub here (additive, scoped to this test file).
const AC = window.AudioContext as unknown as {
  prototype: { createBiquadFilter: () => Record<string, unknown> };
};
const origCreateBiquad = AC.prototype.createBiquadFilter;
AC.prototype.createBiquadFilter = function () {
  const node = origCreateBiquad.call(this) as Record<string, unknown>;
  if (!node.gain) node.gain = { value: 0, setTargetAtTime: () => {} };
  return node;
};

// The metronome click ramps gain — the stub GainNode lacks the ramp/schedule
// methods, so add them (no-ops are fine, we never assert on click audio).
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

/** Build a LoopTrack backed by the StubAudioContext (from setup.ts). */
function makeTrack() {
  const ctx = new (window.AudioContext as unknown as { new (): AudioContext })();
  const input = ctx.createGain();
  const master = ctx.createGain();
  const track = new LoopTrack(0, ctx, input, master);
  return { ctx, track };
}

describe("quantized loop length conformance (stopTrack)", () => {
  it("pads the recorded layer to the quantized length and keeps the mix finite", async () => {
    mockRec.data = new Float32Array(30000).fill(0.5);
    const engine = new AudioEngine();
    engine.timingMode = "quantized";

    await engine.recordTrack(0);
    await engine.stopTrack(0);

    const track = engine.tracks[0];
    // 1 bar @ 120 BPM, 44.1kHz = 2s = 88200 samples (raw was 30000)
    expect(engine.masterLoopLength).toBe(88200);
    expect(track.loopLengthSamples).toBe(88200);
    expect(track.getMixedData()!.length).toBe(88200);

    // Force a rebuild — with unpadded layers this used to read past the
    // layer end and fill the mix with NaN.
    track.setLayerVolume(0, 0.9);
    const rebuilt = track.getMixedData()!;
    expect(rebuilt.length).toBe(88200);
    expect(Array.from(rebuilt).every(Number.isFinite)).toBe(true);

    engine.shutdown();
  });
});

describe("LoopTrack.setLoopLength", () => {
  it("re-pads existing layers so mixdown never reads past a layer's end", () => {
    const { track } = makeTrack();
    track.restoreLayers([new Float32Array(1000).fill(0.25)], 1000);

    track.setLoopLength(1500);

    expect(track.loopLengthSamples).toBe(1500);
    const mixed = track.getMixedData()!;
    expect(mixed.length).toBe(1500);
    expect(Array.from(mixed).every(Number.isFinite)).toBe(true);
    // Original content preserved, padding silent
    expect(mixed[999]).toBeCloseTo(0.25);
    expect(mixed[1200]).toBe(0);
  });

  it("truncates layers when the new length is shorter", () => {
    const { track } = makeTrack();
    track.restoreLayers([new Float32Array(2000).fill(0.25)], 2000);

    track.setLoopLength(1000);

    expect(track.getMixedData()!.length).toBe(1000);
  });
});

describe("recording length cap (free mode)", () => {
  function makeTrackedTrack() {
    const ctx = new (window.AudioContext as unknown as { new (): AudioContext })();
    const created: Array<Record<string, unknown>> = [];
    const orig = ctx.createBufferSource.bind(ctx);
    vi.spyOn(ctx, "createBufferSource").mockImplementation(() => {
      const src = orig() as unknown as Record<string, unknown>;
      created.push(src);
      return src as unknown as AudioBufferSourceNode;
    });
    const track = new LoopTrack(0, ctx, ctx.createGain(), ctx.createGain());
    return { track, created };
  }

  it("schedules an auto-stop when a max length is given and no master loop exists", async () => {
    const { track, created } = makeTrackedTrack();
    await track.startRecording(0, 44100);
    expect(created.some((s) => typeof s.onended === "function")).toBe(true);
  });

  it("schedules no auto-stop when uncapped", async () => {
    const { track, created } = makeTrackedTrack();
    await track.startRecording(0, 0);
    expect(created.some((s) => typeof s.onended === "function")).toBe(false);
  });

  it("AudioEngine passes the configured limit for unbounded first recordings", async () => {
    localStorage.setItem("mloop-recording-limits", JSON.stringify({ maxRecordingTimeSec: 30 }));
    const engine = new AudioEngine();
    const spy = vi.spyOn(engine.tracks[0], "startRecording");
    await engine.recordTrack(0);
    expect(spy).toHaveBeenCalledWith(0, 30 * 44100);
    engine.shutdown();
    localStorage.removeItem("mloop-recording-limits");
  });
});

describe("concurrent stop race", () => {
  it("a second stopRecording during the first is a no-op (no transient empty)", async () => {
    const { track } = makeTrack();
    let resolveStop!: (b: Float32Array) => void;
    let calls = 0;
    // First stop drains slowly; a redundant second stop gets the real
    // Recorder's stopping-guard empty buffer immediately.
    mockRec.stopImpl = () => {
      calls++;
      if (calls === 1) return new Promise((r) => { resolveStop = r; });
      return Promise.resolve(new Float32Array(0));
    };
    await track.startRecording(0);
    expect(track.status).toBe("recording");

    const statuses: string[] = [];
    track.onStateChange = () => statuses.push(track.status);

    const p1 = track.stopRecording(0);
    const p2 = track.stopRecording(0); // racing manual stop vs auto-stop
    resolveStop(new Float32Array(2048).fill(0.3));

    const [len1, len2] = await Promise.all([p1, p2]);
    expect(len1).toBe(2048);
    expect(len2).toBe(0);
    expect(track.status).toBe("playing");
    // The losing call must never have flipped the track to "empty"
    expect(statuses).not.toContain("empty");

    mockRec.stopImpl = null;
  });
});

describe("overdub phase alignment", () => {
  const LOOP = 2048;

  it("writes the overdubbed layer at the playhead phase, not at position 0", async () => {
    const { ctx, track } = makeTrack();
    track.restoreLayers([new Float32Array(LOOP)], LOOP);
    (ctx as unknown as { currentTime: number }).currentTime = 0;
    track.play();

    // Half a loop elapses before the user starts the overdub
    const half = LOOP / 2;
    (ctx as unknown as { currentTime: number }).currentTime = half / ctx.sampleRate;

    const recorded = new Float32Array(LOOP);
    for (let i = 0; i < LOOP; i++) recorded[i] = (i + 1) / LOOP;
    mockRec.data = recorded;

    await track.startOverdub();
    await track.stopOverdub();

    const layer = track.getLayers()[1];
    // What was played at phase `half` must land at buffer index `half`
    expect(layer[half]).toBeCloseTo(recorded[0]);
    expect(layer[(half + 100) % LOOP]).toBeCloseTo(recorded[100]);
    // Wrap-around: the tail of the recording lands at the loop start
    expect(layer[0]).toBeCloseTo(recorded[LOOP - half]);
  });

  it("resumes playback from the current playhead after overdub (no audible jump)", async () => {
    const ctx = new (window.AudioContext as unknown as { new (): AudioContext })();
    const started: Array<{ when: number; offset: number; buffer: { length: number } | null }> = [];
    const orig = ctx.createBufferSource.bind(ctx);
    vi.spyOn(ctx, "createBufferSource").mockImplementation(() => {
      const src = orig() as unknown as { start: (when?: number, offset?: number) => void; buffer: { length: number } | null };
      src.start = (when = 0, offset = 0) => { started.push({ when, offset, buffer: src.buffer }); };
      return src as unknown as AudioBufferSourceNode;
    });
    const track = new LoopTrack(0, ctx, ctx.createGain(), ctx.createGain());
    track.restoreLayers([new Float32Array(LOOP)], LOOP);
    (ctx as unknown as { currentTime: number }).currentTime = 0;
    track.play();

    (ctx as unknown as { currentTime: number }).currentTime = 1024 / ctx.sampleRate;
    mockRec.data = new Float32Array(LOOP);
    await track.startOverdub();

    (ctx as unknown as { currentTime: number }).currentTime = 1536 / ctx.sampleRate;
    await track.stopOverdub();

    // The last full-length playback source must resume at the playhead
    const playbackStarts = started.filter((s) => s.buffer !== null && s.buffer.length === LOOP);
    const last = playbackStarts[playbackStarts.length - 1];
    expect(last.offset).toBeCloseTo(1536 / ctx.sampleRate, 5);
  });
});
