import { describe, it, expect } from "vitest";
import {
  serializeSessionExport,
  applySessionExport,
  type SessionExport,
} from "../hooks/loopEnginePersistence";
import type { AudioEngine } from "../engine/AudioEngine";

// ── Minimal mock engine ──────────────────────────────────────────────────
// The persistence layer only touches a well-defined slice of AudioEngine,
// so we hand-roll just the parts it reads/writes.

interface MockTrack {
  _layers: Float32Array[];
  volume: number;
  isReversed: boolean;
  playbackRate: number;
  loopLengthSamples: number;
  getLayers(): Float32Array[];
  restoreLayers(layers: Float32Array[], loopLengthSamples: number): void;
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
    ...initial,
  };
  return t;
}

function makeEngine(tracks: MockTrack[]): AudioEngine {
  let stopped = false;
  const engine = {
    tracks,
    masterLoopLength: 44100,
    timing: { bpm: 128 },
    timingMode: "quantized",
    syncMode: "lock",
    stopAll() { stopped = true; },
    get __stopped() { return stopped; },
  } as unknown as AudioEngine;
  return engine;
}

describe("loopEnginePersistence", () => {
  it("serializeSessionExport captures engine state verbatim", () => {
    const t0 = makeTrack({
      _layers: [new Float32Array([0.1, 0.2, 0.3])],
      volume: 0.5,
      isReversed: true,
      playbackRate: 0.5,
      loopLengthSamples: 1024,
    });
    const t1 = makeTrack();
    const engine = makeEngine([t0, t1]);

    const out = serializeSessionExport(engine);
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
    // Float32 precision: exported values lose trailing bits — compare with tolerance
    expect(out.tracks[0].layers).toHaveLength(1);
    expect(out.tracks[0].layers[0]).toHaveLength(3);
    out.tracks[0].layers[0].forEach((v, i) => expect(v).toBeCloseTo([0.1, 0.2, 0.3][i], 5));
    expect(out.tracks[1].layers).toEqual([]);
  });

  it("applySessionExport restores every field and calls stopAll", () => {
    const tracks = [makeTrack(), makeTrack(), makeTrack()];
    const engine = makeEngine(tracks);

    const payload: SessionExport = {
      version: 1,
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
    applySessionExport(engine, payload);

    expect((engine as unknown as { __stopped: boolean }).__stopped).toBe(true);
    expect(engine.masterLoopLength).toBe(88200);
    expect(engine.timing.bpm).toBe(96);
    expect(engine.timingMode).toBe("free");
    expect(engine.syncMode).toBe("sync");
    expect(tracks[0].volume).toBe(0.25);
    expect(tracks[0].isReversed).toBe(true);
    expect(tracks[0].playbackRate).toBe(0.5);
    expect(tracks[0].loopLengthSamples).toBe(3);
    expect(Array.from(tracks[0]._layers[0])).toEqual([1, -1, 0.5]);
    expect(tracks[1]._layers).toEqual([]);
    expect(tracks[2]._layers[0][0]).toBeCloseTo(0.1, 5);
  });

  it("applySessionExport rejects invalid payloads", () => {
    const engine = makeEngine([makeTrack()]);
    expect(() => applySessionExport(engine, null)).toThrow("Invalid session file");
    expect(() => applySessionExport(engine, { version: 1 })).toThrow("Invalid session file");
    expect(() => applySessionExport(engine, { tracks: [] })).toThrow("Invalid session file");
    expect(() => applySessionExport(engine, "not-json")).toThrow("Invalid session file");
  });

  it("serializeSessionExport -> applySessionExport round-trips state", () => {
    const t0 = makeTrack({
      _layers: [new Float32Array([0.4, -0.4, 0.2, -0.2])],
      volume: 0.33,
      isReversed: true,
      playbackRate: 0.5,
      loopLengthSamples: 4,
    });
    const source = makeEngine([t0, makeTrack(), makeTrack()]);
    const serialized = JSON.stringify(serializeSessionExport(source));

    // Fresh engine receives the JSON back
    const sinkTracks = [makeTrack(), makeTrack(), makeTrack()];
    const sink = makeEngine(sinkTracks);
    sink.masterLoopLength = 0;
    sink.timing.bpm = 60;

    applySessionExport(sink, JSON.parse(serialized));
    expect(sink.masterLoopLength).toBe(44100);
    expect(sink.timing.bpm).toBe(128);
    expect(sinkTracks[0].volume).toBe(0.33);
    expect(sinkTracks[0].isReversed).toBe(true);
    const restored = Array.from(sinkTracks[0]._layers[0]);
    [0.4, -0.4, 0.2, -0.2].forEach((expected, i) => expect(restored[i]).toBeCloseTo(expected, 5));
  });
});
