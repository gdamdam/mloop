import { describe, it, expect, vi, afterEach } from "vitest";
import {
  serializeSessionExport,
  applySessionExport,
  serializeSessionData,
  applySessionData,
  handleLoadSession,
  handleSaveSession,
  padSnapshotToStored,
  padStoredToSnapshot,
  padSnapshotToExport,
  padExportToSnapshot,
  sessionHasContent,
  type SessionExport,
} from "../hooks/loopEnginePersistence";
import type { AudioEngine } from "../engine/AudioEngine";
import { PadEngine, type PadPersistencePort, type PadSnapshot, type PadSlotSnapshot } from "../engine/PadEngine";
import type { SessionData } from "../utils/storage";
import * as storage from "../utils/storage";

// ── Minimal mocks ─────────────────────────────────────────────────────────
// The persistence layer only touches a well-defined slice of each engine;
// hand-rolling the surface keeps tests independent of AudioContext.

interface MockTrack {
  _layers: Float32Array[];
  volume: number;
  isReversed: boolean;
  playbackRate: number;
  loopLengthSamples: number;
  getLayers(): Float32Array[];
  restoreLayers(layers: Float32Array[], loopLengthSamples: number): void;
  getEffects(): Record<string, unknown>;
}

function makeTrack(initial?: Partial<MockTrack>): MockTrack {
  const t: MockTrack = {
    _layers: [],
    volume: 0.8,
    isReversed: false,
    playbackRate: 1,
    loopLengthSamples: 0,
    getLayers() { return this._layers; },
    restoreLayers(layers, len) {
      this._layers = layers;
      this.loopLengthSamples = len;
    },
    getEffects() { return {}; },
    ...initial,
  };
  return t;
}

interface MockEngine {
  tracks: MockTrack[];
  masterLoopLength: number;
  timing: { bpm: number };
  timingMode: "free" | "quantized";
  syncMode: "free" | "sync" | "lock";
  stopAllCount: number;
}

function makeEngine(tracks: MockTrack[], overrides: Partial<MockEngine> = {}): AudioEngine {
  const engine: MockEngine & { stopAll(): void } = {
    tracks,
    masterLoopLength: 44100,
    timing: { bpm: 128 },
    timingMode: "quantized",
    syncMode: "lock",
    stopAllCount: 0,
    stopAll() { this.stopAllCount++; },
    ...overrides,
  };
  return engine as unknown as AudioEngine;
}

// ── Mock pad engine ──────────────────────────────────────────────────────

function emptyPadSlot(overrides: Partial<PadSlotSnapshot> = {}): PadSlotSnapshot {
  return {
    name: "",
    buffer: null,
    volume: 1,
    pan: 0,
    pitch: 0,
    playMode: "one",
    trimStart: 0,
    trimEnd: 1,
    loopBeats: 0,
    muteGroup: 0,
    ...overrides,
  };
}

function makePadSnapshot(partial: Partial<PadSnapshot> = {}): PadSnapshot {
  return {
    version: 1,
    slots: Array.from({ length: 16 }, () => emptyPadSlot()),
    seqGrid: Array.from({ length: 64 }, () => Array(16).fill(false)),
    seqNumSteps: 16,
    seqSwing: 0,
    ...partial,
  };
}

/**
 * Mock pad engine — stores the last loaded snapshot verbatim so tests can
 * assert "what came out of getSnapshot was fed back into loadSnapshot".
 */
function makePadEngine(initial?: PadSnapshot): PadPersistencePort & { snapshot: PadSnapshot; loadCount: number } {
  let snap = initial ?? makePadSnapshot();
  let loadCount = 0;
  return {
    get snapshot() { return snap; },
    get loadCount() { return loadCount; },
    getSnapshot() {
      // Deep copy so mutations on the returned object don't leak back
      return {
        version: snap.version,
        slots: snap.slots.map((s) => ({
          ...s,
          buffer: s.buffer ? new Float32Array(s.buffer) : null,
        })),
        seqGrid: snap.seqGrid.map((row) => [...row]),
        seqNumSteps: snap.seqNumSteps,
        seqSwing: snap.seqSwing,
      };
    },
    loadSnapshot(next) {
      loadCount++;
      snap = {
        version: next.version,
        slots: next.slots.map((s) => ({
          ...s,
          buffer: s.buffer ? new Float32Array(s.buffer) : null,
        })),
        seqGrid: next.seqGrid.map((row) => [...row]),
        seqNumSteps: next.seqNumSteps,
        seqSwing: next.seqSwing,
      };
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── serializeSessionExport ────────────────────────────────────────────────

describe("serializeSessionExport", () => {
  it("captures engine state verbatim when no pad engine is provided", () => {
    const t0 = makeTrack({
      _layers: [new Float32Array([0.1, 0.2, 0.3])],
      volume: 0.5,
      isReversed: true,
      playbackRate: 0.5,
      loopLengthSamples: 1024,
    });
    const engine = makeEngine([t0, makeTrack()]);

    const out = serializeSessionExport(engine, null);
    expect(out.version).toBe(1);
    expect(out.bpm).toBe(128);
    expect(out.timingMode).toBe("quantized");
    expect(out.syncMode).toBe("lock");
    expect(out.masterLoopLength).toBe(44100);
    expect(out.tracks).toHaveLength(2);
    expect(out.tracks[0]).toMatchObject({
      volume: 0.5,
      isReversed: true,
      playbackRate: 0.5,
      loopLengthSamples: 1024,
    });
    expect(out.tracks[0].layers).toHaveLength(1);
    out.tracks[0].layers[0].forEach((v, i) => expect(v).toBeCloseTo([0.1, 0.2, 0.3][i], 5));
    expect(out.pad).toBeUndefined();
  });

  it("includes pad state when a pad engine is provided and bumps version to 2", () => {
    const engine = makeEngine([makeTrack(), makeTrack(), makeTrack()]);
    const padSnap = makePadSnapshot({
      slots: [
        emptyPadSlot({ name: "Kick", buffer: new Float32Array([0.9, -0.9]), volume: 0.7 }),
        ...Array.from({ length: 15 }, () => emptyPadSlot()),
      ],
      seqSwing: 0.25,
    });
    const pad = makePadEngine(padSnap);

    const out = serializeSessionExport(engine, pad);
    expect(out.version).toBe(2);
    expect(out.pad).toBeDefined();
    expect(out.pad!.slots[0].name).toBe("Kick");
    expect(out.pad!.slots[0].volume).toBe(0.7);
    expect(out.pad!.slots[0].buffer).toEqual([0.9, -0.9].map((v) => expect.closeTo(v, 5)));
    expect(out.pad!.seqSwing).toBe(0.25);
  });
});

// ── applySessionExport ────────────────────────────────────────────────────

describe("applySessionExport", () => {
  it("restores every looper field and calls stopAll", () => {
    const tracks = [makeTrack(), makeTrack(), makeTrack()];
    const engine = makeEngine(tracks, { masterLoopLength: 0, timing: { bpm: 60 }, syncMode: "free" });

    const payload: SessionExport = {
      version: 2,
      bpm: 96,
      timingMode: "free",
      syncMode: "sync",
      masterLoopLength: 88200,
      tracks: [
        { layers: [[1, -1, 0.5]], volume: 0.25, isReversed: true, playbackRate: 0.5, loopLengthSamples: 3 },
        { layers: [], volume: 0.9, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [[0.1]], volume: 0.6, isReversed: false, playbackRate: 1, loopLengthSamples: 1 },
      ],
    };
    applySessionExport(engine, null, payload);

    expect((engine as unknown as MockEngine).stopAllCount).toBe(1);
    expect(engine.masterLoopLength).toBe(88200);
    expect(engine.timing.bpm).toBe(96);
    expect(engine.timingMode).toBe("free");
    expect(engine.syncMode).toBe("sync");
    expect(tracks[0].volume).toBe(0.25);
    expect(tracks[0].isReversed).toBe(true);
    expect(tracks[0].playbackRate).toBe(0.5);
    expect(Array.from(tracks[0]._layers[0])).toEqual([1, -1, 0.5]);
  });

  it("restores pad state when present", () => {
    const engine = makeEngine([makeTrack(), makeTrack(), makeTrack()]);
    const pad = makePadEngine();

    const payload: SessionExport = {
      version: 2,
      bpm: 120,
      timingMode: "free",
      syncMode: "lock",
      masterLoopLength: 0,
      tracks: [
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      ],
      pad: {
        slots: [
          { name: "Snare", buffer: [0.3, 0.4], volume: 0.8, pan: 0.2, pitch: 2, playMode: "one", trimStart: 0.1, trimEnd: 0.9, loopBeats: 0, muteGroup: 1 },
          ...Array.from({ length: 15 }, () => ({ name: "", buffer: null, volume: 1, pan: 0, pitch: 0, playMode: "one" as const, trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0 })),
        ],
        seqGrid: [[true, false], [false, true]],
        seqNumSteps: 32,
        seqSwing: 0.4,
      },
    };

    applySessionExport(engine, pad, payload);
    expect(pad.loadCount).toBe(1);
    expect(pad.snapshot.slots[0].name).toBe("Snare");
    expect(pad.snapshot.slots[0].muteGroup).toBe(1);
    expect(pad.snapshot.seqNumSteps).toBe(32);
    expect(pad.snapshot.seqSwing).toBe(0.4);
    expect(pad.snapshot.slots[0].buffer).not.toBeNull();
    expect(Array.from(pad.snapshot.slots[0].buffer!)[0]).toBeCloseTo(0.3, 5);
  });

  it("ignores pad state in the payload when no pad engine is provided", () => {
    const engine = makeEngine([makeTrack(), makeTrack(), makeTrack()]);
    const payload: SessionExport = {
      version: 2,
      bpm: 110,
      timingMode: "free",
      syncMode: "free",
      masterLoopLength: 0,
      tracks: [
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      ],
      pad: {
        slots: [{ name: "x", buffer: null, volume: 1, pan: 0, pitch: 0, playMode: "one", trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0 }],
        seqGrid: [], seqNumSteps: 16, seqSwing: 0,
      },
    };
    expect(() => applySessionExport(engine, null, payload)).not.toThrow();
    expect(engine.syncMode).toBe("free");
  });

  it("defaults syncMode to free when payload omits it (legacy v0.1.0 files)", () => {
    const engine = makeEngine([makeTrack(), makeTrack(), makeTrack()]);
    const legacy = {
      version: 1 as const,
      bpm: 120,
      timingMode: "free" as const,
      // no syncMode
      masterLoopLength: 0,
      tracks: [
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      ],
    };
    engine.syncMode = "lock"; // start dirty
    applySessionExport(engine, null, legacy);
    expect(engine.syncMode).toBe("free");
  });

  it("rejects invalid payloads", () => {
    const engine = makeEngine([makeTrack()]);
    expect(() => applySessionExport(engine, null, null)).toThrow("Invalid session file");
    expect(() => applySessionExport(engine, null, { version: 1 })).toThrow("Invalid session file");
    expect(() => applySessionExport(engine, null, { tracks: [] })).toThrow("Invalid session file");
    expect(() => applySessionExport(engine, null, "not-json")).toThrow("Invalid session file");
  });

  it("round-trips the full session state (looper + pad) through JSON", () => {
    const sourceTracks = [
      makeTrack({
        _layers: [new Float32Array([0.4, -0.4, 0.2, -0.2])],
        volume: 0.33,
        isReversed: true,
        playbackRate: 0.5,
        loopLengthSamples: 4,
      }),
      makeTrack(),
      makeTrack(),
    ];
    const sourceEngine = makeEngine(sourceTracks);
    const sourcePad = makePadEngine(makePadSnapshot({
      slots: [
        emptyPadSlot({ name: "Pad1", buffer: new Float32Array([0.7, -0.7]), volume: 0.5, pan: -0.3 }),
        ...Array.from({ length: 15 }, () => emptyPadSlot()),
      ],
      seqGrid: [[true, false, true]],
      seqSwing: 0.15,
    }));

    const serialized = JSON.stringify(serializeSessionExport(sourceEngine, sourcePad));

    const sinkTracks = [makeTrack(), makeTrack(), makeTrack()];
    const sinkEngine = makeEngine(sinkTracks, { masterLoopLength: 0, timing: { bpm: 60 }, syncMode: "free" });
    const sinkPad = makePadEngine();

    applySessionExport(sinkEngine, sinkPad, JSON.parse(serialized));

    // Looper
    expect(sinkEngine.masterLoopLength).toBe(44100);
    expect(sinkEngine.timing.bpm).toBe(128);
    expect(sinkEngine.syncMode).toBe("lock");
    expect(sinkTracks[0].volume).toBe(0.33);
    expect(sinkTracks[0].isReversed).toBe(true);
    const restored = Array.from(sinkTracks[0]._layers[0]);
    [0.4, -0.4, 0.2, -0.2].forEach((v, i) => expect(restored[i]).toBeCloseTo(v, 5));

    // Pad
    expect(sinkPad.snapshot.slots[0].name).toBe("Pad1");
    expect(sinkPad.snapshot.slots[0].volume).toBe(0.5);
    expect(sinkPad.snapshot.slots[0].pan).toBeCloseTo(-0.3, 5);
    expect(Array.from(sinkPad.snapshot.slots[0].buffer!)[0]).toBeCloseTo(0.7, 5);
    expect(sinkPad.snapshot.seqGrid).toEqual([[true, false, true]]);
    expect(sinkPad.snapshot.seqSwing).toBeCloseTo(0.15, 5);
  });
});

// ── serializeSessionData (IndexedDB binary shape) ─────────────────────────

describe("serializeSessionData", () => {
  it("includes syncMode and pad state", () => {
    const engine = makeEngine([
      makeTrack({ _layers: [new Float32Array([0.5])], volume: 0.4, isReversed: true, loopLengthSamples: 1 }),
      makeTrack(),
      makeTrack(),
    ]);
    const pad = makePadEngine(makePadSnapshot({
      slots: [
        emptyPadSlot({ name: "Hat", buffer: new Float32Array([0.2, 0.2]) }),
        ...Array.from({ length: 15 }, () => emptyPadSlot()),
      ],
    }));

    const data = serializeSessionData(engine, pad, "my-session");
    expect(data.name).toBe("my-session");
    expect(data.syncMode).toBe("lock");
    expect(data.tracks[0].isReversed).toBe(true);
    expect(data.tracks[0].layers[0]).toBeInstanceOf(ArrayBuffer);
    expect(data.pad).toBeDefined();
    expect(data.pad!.slots[0].name).toBe("Hat");
    expect(data.pad!.slots[0].buffer).toBeInstanceOf(ArrayBuffer);
  });

  it("omits pad when no pad engine is provided", () => {
    const engine = makeEngine([makeTrack(), makeTrack(), makeTrack()]);
    const data = serializeSessionData(engine, null, "x");
    expect(data.pad).toBeUndefined();
  });
});

// ── applySessionData + handleLoadSession ──────────────────────────────────

describe("applySessionData", () => {
  it("restores syncMode, reverse, playbackRate, and pad state", () => {
    const tracks = [makeTrack(), makeTrack(), makeTrack()];
    const engine = makeEngine(tracks, { syncMode: "free" });
    const pad = makePadEngine();

    const data: SessionData = {
      name: "s",
      savedAt: 0,
      bpm: 90,
      timingMode: "quantized",
      syncMode: "lock",
      masterLoopLength: 16000,
      tracks: [
        { layers: [new Float32Array([0.1]).buffer], volume: 0.5, isReversed: true, playbackRate: 0.5, loopLengthSamples: 1 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      ],
      pad: {
        slots: Array.from({ length: 16 }, (_, i) => ({
          name: i === 0 ? "Ding" : "",
          buffer: i === 0 ? new Float32Array([0.25, -0.25]).buffer : null,
          volume: 1, pan: 0, pitch: 0, playMode: "one" as const,
          trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0,
        })),
        seqGrid: [],
        seqNumSteps: 16,
        seqSwing: 0.2,
      },
    };

    applySessionData(engine, pad, data);
    expect(engine.syncMode).toBe("lock");
    expect(tracks[0].isReversed).toBe(true);
    expect(tracks[0].playbackRate).toBe(0.5);
    expect(pad.snapshot.slots[0].name).toBe("Ding");
    expect(pad.snapshot.seqSwing).toBeCloseTo(0.2, 5);
  });

  it("loads a legacy session without syncMode or pad", () => {
    const tracks = [makeTrack(), makeTrack(), makeTrack()];
    const engine = makeEngine(tracks, { syncMode: "lock" });
    const pad = makePadEngine();
    const startSnap = pad.snapshot;

    const legacy: SessionData = {
      name: "legacy",
      savedAt: 0,
      bpm: 120,
      timingMode: "free",
      // no syncMode, no pad
      masterLoopLength: 0,
      tracks: [
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      ],
    };
    expect(() => applySessionData(engine, pad, legacy)).not.toThrow();
    // syncMode preserved (loader leaves it alone when undefined)
    expect(engine.syncMode).toBe("lock");
    // pad untouched
    expect(pad.loadCount).toBe(0);
    expect(pad.snapshot).toBe(startSnap);
  });
});

describe("handleLoadSession + handleSaveSession (IDB path)", () => {
  it("saveSession receives a full SessionData with pad + syncMode", async () => {
    const engine = makeEngine([makeTrack(), makeTrack(), makeTrack()]);
    const pad = makePadEngine(makePadSnapshot({
      slots: [
        emptyPadSlot({ name: "Kick", buffer: new Float32Array([0.5]) }),
        ...Array.from({ length: 15 }, () => emptyPadSlot()),
      ],
    }));
    const saveSpy = vi.spyOn(storage, "saveSession").mockResolvedValue();

    await handleSaveSession(engine, pad, "groove-1");

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saved = saveSpy.mock.calls[0][0];
    expect(saved.name).toBe("groove-1");
    expect(saved.syncMode).toBe("lock");
    expect(saved.pad).toBeDefined();
    expect(saved.pad!.slots[0].name).toBe("Kick");
  });

  it("handleLoadSession restores both looper and pad from storage", async () => {
    const tracks = [makeTrack(), makeTrack(), makeTrack()];
    const engine = makeEngine(tracks, { syncMode: "free" });
    const pad = makePadEngine();

    const stored: SessionData = {
      name: "pinned",
      savedAt: 0,
      bpm: 110,
      timingMode: "free",
      syncMode: "sync",
      masterLoopLength: 22000,
      tracks: [
        { layers: [new Float32Array([0.9]).buffer], volume: 0.7, isReversed: false, playbackRate: 1, loopLengthSamples: 1 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
        { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      ],
      pad: {
        slots: Array.from({ length: 16 }, (_, i) => ({
          name: i === 2 ? "Hat" : "",
          buffer: i === 2 ? new Float32Array([0.15]).buffer : null,
          volume: 1, pan: 0, pitch: 0, playMode: "one" as const,
          trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0,
        })),
        seqGrid: [[true]],
        seqNumSteps: 8,
        seqSwing: 0.1,
      },
    };
    vi.spyOn(storage, "loadSession").mockResolvedValue(stored);

    await handleLoadSession(engine, pad, "pinned");

    expect(engine.syncMode).toBe("sync");
    expect(engine.timing.bpm).toBe(110);
    expect(tracks[0]._layers.length).toBe(1);
    expect(pad.snapshot.slots[2].name).toBe("Hat");
    expect(pad.snapshot.seqNumSteps).toBe(8);
    expect(pad.snapshot.seqSwing).toBeCloseTo(0.1, 5);
  });

  it("handleLoadSession is a no-op when storage returns undefined", async () => {
    const engine = makeEngine([makeTrack(), makeTrack(), makeTrack()], { syncMode: "lock" });
    const pad = makePadEngine();
    vi.spyOn(storage, "loadSession").mockResolvedValue(undefined);

    await handleLoadSession(engine, pad, "nope");
    expect(engine.syncMode).toBe("lock");
    expect(pad.loadCount).toBe(0);
  });
});

// ── Converter helpers ────────────────────────────────────────────────────

// ── sessionHasContent (pinned-indicator predicate) ──────────────────────

describe("sessionHasContent", () => {
  const makeBase = (): SessionData => ({
    name: "s",
    savedAt: 0,
    bpm: 120,
    timingMode: "free",
    masterLoopLength: 0,
    tracks: [
      { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
      { layers: [], volume: 0.8, isReversed: false, playbackRate: 1, loopLengthSamples: 0 },
    ],
  });

  it("returns false for undefined / null", () => {
    expect(sessionHasContent(undefined)).toBe(false);
    expect(sessionHasContent(null)).toBe(false);
  });

  it("returns false for empty sessions", () => {
    expect(sessionHasContent(makeBase())).toBe(false);
  });

  it("returns true when a looper track has layers", () => {
    const s = makeBase();
    s.tracks[0].layers = [new Float32Array([0.5]).buffer];
    expect(sessionHasContent(s)).toBe(true);
  });

  it("returns true for PAD-only sessions (no looper layers)", () => {
    const s = makeBase();
    s.pad = {
      slots: [
        { name: "Kick", buffer: new Float32Array([0.9]).buffer, volume: 1, pan: 0, pitch: 0, playMode: "one", trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0 },
        ...Array.from({ length: 15 }, () => ({ name: "", buffer: null, volume: 1, pan: 0, pitch: 0, playMode: "one" as const, trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0 })),
      ],
      seqGrid: [],
      seqNumSteps: 16,
      seqSwing: 0,
    };
    expect(sessionHasContent(s)).toBe(true);
  });

  it("returns false when PAD section exists but every slot is empty", () => {
    const s = makeBase();
    s.pad = {
      slots: Array.from({ length: 16 }, () => ({ name: "", buffer: null, volume: 1, pan: 0, pitch: 0, playMode: "one" as const, trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0 })),
      seqGrid: [],
      seqNumSteps: 16,
      seqSwing: 0,
    };
    expect(sessionHasContent(s)).toBe(false);
  });
});

// ── PadEngine.loadSnapshot — full-reset semantics ───────────────────────
// Uses the real PadEngine with the stub AudioContext from __tests__/setup.ts.

describe("PadEngine.loadSnapshot", () => {
  function makePadEngine(): PadEngine {
    const ctx = new window.AudioContext();
    const input = ctx.createGain();
    const master = ctx.createGain();
    return new PadEngine(ctx as unknown as AudioContext, input, master);
  }

  function loadedSlot(name: string, data: number[]): PadSlotSnapshot {
    return {
      name,
      buffer: new Float32Array(data),
      volume: 0.75,
      pan: 0.2,
      pitch: 1,
      playMode: "loop",
      trimStart: 0.1,
      trimEnd: 0.9,
      loopBeats: 2,
      muteGroup: 1,
    };
  }

  it("resets slots not mentioned in a short snapshot back to defaults", () => {
    const pad = makePadEngine();
    // Pre-populate all 16 slots with non-default state via a full snapshot.
    const full: PadSnapshot = {
      version: 1,
      slots: Array.from({ length: 16 }, (_, i) => loadedSlot(`Pad ${i}`, [0.1 * (i + 1)])),
      seqGrid: [[true]],
      seqNumSteps: 32,
      seqSwing: 0.5,
    };
    pad.loadSnapshot(full);
    expect(pad.slots[10].status).toBe("loaded");
    expect(pad.slots[10].name).toBe("Pad 10");
    expect(pad.slots[10].muteGroup).toBe(1);

    // Now restore from a snapshot that only mentions the first 3 slots.
    const partial: PadSnapshot = {
      version: 1,
      slots: [loadedSlot("One", [0.5]), loadedSlot("Two", [0.5]), loadedSlot("Three", [0.5])],
      seqGrid: [[true, false]],
      seqNumSteps: 16,
      seqSwing: 0.1,
    };
    pad.loadSnapshot(partial);

    // First 3 slots follow the snapshot.
    expect(pad.slots[0].name).toBe("One");
    expect(pad.slots[2].status).toBe("loaded");

    // Slots 3..15 are reset to constructor defaults — no ghost samples.
    for (let i = 3; i < 16; i++) {
      expect(pad.slots[i].status, `slot ${i} status`).toBe("empty");
      expect(pad.slots[i].name, `slot ${i} name`).toBe("");
      expect(pad.slots[i].buffer, `slot ${i} buffer`).toBeNull();
      expect(pad.slots[i].audioBuffer, `slot ${i} audioBuffer`).toBeNull();
      expect(pad.slots[i].volume, `slot ${i} volume`).toBe(1);
      expect(pad.slots[i].pan, `slot ${i} pan`).toBe(0);
      expect(pad.slots[i].pitch, `slot ${i} pitch`).toBe(0);
      expect(pad.slots[i].playMode, `slot ${i} playMode`).toBe("one");
      expect(pad.slots[i].trimStart, `slot ${i} trimStart`).toBe(0);
      expect(pad.slots[i].trimEnd, `slot ${i} trimEnd`).toBe(1);
      expect(pad.slots[i].loopBeats, `slot ${i} loopBeats`).toBe(0);
      expect(pad.slots[i].muteGroup, `slot ${i} muteGroup`).toBe(0);
    }
  });

  it("resets sequencer fields to defaults when the snapshot omits them", () => {
    const pad = makePadEngine();
    // Establish non-default sequencer state.
    pad.loadSnapshot({
      version: 1,
      slots: Array.from({ length: 16 }, () => loadedSlot("x", [0.1])),
      seqGrid: [[true, true], [false, true]],
      seqNumSteps: 64,
      seqSwing: 0.8,
    });
    expect(pad.getSnapshot().seqNumSteps).toBe(64);
    expect(pad.getSnapshot().seqSwing).toBeCloseTo(0.8, 5);

    // Restore from a snapshot with missing sequencer fields (cast through
    // unknown to simulate a legacy / malformed snapshot shape).
    const malformed = {
      version: 1,
      slots: [],
      // seqGrid / seqNumSteps / seqSwing intentionally missing
    } as unknown as PadSnapshot;
    pad.loadSnapshot(malformed);

    const after = pad.getSnapshot();
    expect(after.seqGrid).toEqual([]);
    expect(after.seqNumSteps).toBe(16);
    expect(after.seqSwing).toBe(0);
    // And every slot is back to defaults.
    for (const s of pad.slots) {
      expect(s.status).toBe("empty");
      expect(s.buffer).toBeNull();
    }
  });

  it("clamps seqSwing into [0, 1]", () => {
    const pad = makePadEngine();
    pad.loadSnapshot({
      version: 1,
      slots: [],
      seqGrid: [],
      seqNumSteps: 16,
      seqSwing: 5,
    });
    expect(pad.getSnapshot().seqSwing).toBe(1);

    pad.loadSnapshot({
      version: 1,
      slots: [],
      seqGrid: [],
      seqNumSteps: 16,
      seqSwing: -1,
    });
    expect(pad.getSnapshot().seqSwing).toBe(0);
  });

  it("round-trips through getSnapshot → loadSnapshot without state drift", () => {
    const pad = makePadEngine();
    const original: PadSnapshot = {
      version: 1,
      slots: Array.from({ length: 16 }, (_, i) => i < 4 ? loadedSlot(`Slot ${i}`, [0.2 * i, -0.2 * i]) : {
        name: "", buffer: null, volume: 1, pan: 0, pitch: 0, playMode: "one",
        trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0,
      }),
      seqGrid: [[true, false], [false, true]],
      seqNumSteps: 16,
      seqSwing: 0.33,
    };
    pad.loadSnapshot(original);
    const snap = pad.getSnapshot();

    // Mutate the pad, then restore — should be indistinguishable.
    pad.loadSnapshot({ version: 1, slots: [], seqGrid: [], seqNumSteps: 16, seqSwing: 0 });
    pad.loadSnapshot(snap);

    expect(pad.slots[0].name).toBe("Slot 0");
    expect(pad.slots[3].playMode).toBe("loop");
    expect(pad.slots[3].muteGroup).toBe(1);
    expect(pad.slots[15].status).toBe("empty");
    const out = pad.getSnapshot();
    expect(out.seqNumSteps).toBe(16);
    expect(out.seqSwing).toBeCloseTo(0.33, 5);
    expect(out.seqGrid).toEqual([[true, false], [false, true]]);
  });
});

// ── Converter helpers ────────────────────────────────────────────────────

describe("pad snapshot converters", () => {
  it("padSnapshotToStored → padStoredToSnapshot round-trips", () => {
    const snap = makePadSnapshot({
      slots: [
        emptyPadSlot({ name: "A", buffer: new Float32Array([1, -1, 0.5]) }),
        ...Array.from({ length: 15 }, () => emptyPadSlot()),
      ],
      seqSwing: 0.33,
    });
    const stored = padSnapshotToStored(snap);
    expect(stored.slots[0].buffer).toBeInstanceOf(ArrayBuffer);
    const restored = padStoredToSnapshot(stored);
    expect(restored.slots[0].name).toBe("A");
    expect(Array.from(restored.slots[0].buffer!)).toEqual([1, -1, 0.5]);
    expect(restored.seqSwing).toBeCloseTo(0.33, 5);
  });

  it("padSnapshotToExport → padExportToSnapshot round-trips through JSON", () => {
    const snap = makePadSnapshot({
      slots: [
        emptyPadSlot({ name: "B", buffer: new Float32Array([0.25, -0.25, 0.75]) }),
        ...Array.from({ length: 15 }, () => emptyPadSlot()),
      ],
    });
    const exp = padSnapshotToExport(snap);
    expect(exp.slots[0].buffer).toEqual([0.25, -0.25, 0.75]);
    const viaJson = JSON.parse(JSON.stringify(exp));
    const restored = padExportToSnapshot(viaJson);
    expect(restored.slots[0].name).toBe("B");
    expect(Array.from(restored.slots[0].buffer!)).toEqual([0.25, -0.25, 0.75]);
  });
});
