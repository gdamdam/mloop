import { describe, it, expect, beforeEach } from "vitest";
import {
  loadLimits,
  saveLimits,
  estimateSessionSizeMB,
  maxRecordingSamples,
} from "../utils/recordingLimits";

// Mock localStorage for Node environment
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
  get length() { return Object.keys(storage).length; },
  key: (i: number) => Object.keys(storage)[i] ?? null,
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

beforeEach(() => {
  localStorageMock.clear();
});

describe("loadLimits", () => {
  it("returns defaults when nothing stored", () => {
    const limits = loadLimits();
    expect(limits.maxRecordingTimeSec).toBe(120);
    expect(limits.maxSessionSizeMB).toBe(100);
  });

  it("returns stored values when present", () => {
    localStorageMock.setItem(
      "mloop-recording-limits",
      JSON.stringify({ maxRecordingTimeSec: 60, maxSessionSizeMB: 200 }),
    );
    const limits = loadLimits();
    expect(limits.maxRecordingTimeSec).toBe(60);
    expect(limits.maxSessionSizeMB).toBe(200);
  });

  it("merges partial stored values with defaults", () => {
    localStorageMock.setItem(
      "mloop-recording-limits",
      JSON.stringify({ maxRecordingTimeSec: 30 }),
    );
    const limits = loadLimits();
    expect(limits.maxRecordingTimeSec).toBe(30);
    expect(limits.maxSessionSizeMB).toBe(100); // default
  });

  it("returns defaults on corrupt JSON", () => {
    localStorageMock.setItem("mloop-recording-limits", "not-json{{{");
    const limits = loadLimits();
    expect(limits.maxRecordingTimeSec).toBe(120);
    expect(limits.maxSessionSizeMB).toBe(100);
  });
});

describe("saveLimits", () => {
  it("persists limits to localStorage", () => {
    saveLimits({ maxRecordingTimeSec: 300, maxSessionSizeMB: 50 });
    const raw = localStorageMock.getItem("mloop-recording-limits");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.maxRecordingTimeSec).toBe(300);
    expect(parsed.maxSessionSizeMB).toBe(50);
  });

  it("roundtrips through loadLimits", () => {
    const original = { maxRecordingTimeSec: 60, maxSessionSizeMB: 200 };
    saveLimits(original);
    const loaded = loadLimits();
    expect(loaded).toEqual(original);
  });
});

describe("estimateSessionSizeMB", () => {
  it("returns 0 for empty array", () => {
    expect(estimateSessionSizeMB([])).toBe(0);
  });

  it("calculates correct size for one buffer", () => {
    // 1MB = 1024*1024 bytes; Float32 = 4 bytes per element
    const samplesFor1MB = (1024 * 1024) / 4;
    const buf = new Float32Array(samplesFor1MB);
    expect(estimateSessionSizeMB([buf])).toBeCloseTo(1.0);
  });

  it("sums multiple buffers", () => {
    const samplesFor1MB = (1024 * 1024) / 4;
    const a = new Float32Array(samplesFor1MB);
    const b = new Float32Array(samplesFor1MB);
    expect(estimateSessionSizeMB([a, b])).toBeCloseTo(2.0);
  });

  it("handles small buffers", () => {
    const buf = new Float32Array(100); // 400 bytes
    expect(estimateSessionSizeMB([buf])).toBeCloseTo(400 / (1024 * 1024));
  });
});

describe("maxRecordingSamples", () => {
  it("converts time to samples at given sample rate", () => {
    const limits = { maxRecordingTimeSec: 2, maxSessionSizeMB: 100 };
    expect(maxRecordingSamples(limits, 44100)).toBe(88200);
  });

  it("returns 0 for unlimited (maxRecordingTimeSec = 0)", () => {
    const limits = { maxRecordingTimeSec: 0, maxSessionSizeMB: 100 };
    expect(maxRecordingSamples(limits, 44100)).toBe(0);
  });

  it("returns 0 for negative time (treated as unlimited)", () => {
    const limits = { maxRecordingTimeSec: -1, maxSessionSizeMB: 100 };
    expect(maxRecordingSamples(limits, 48000)).toBe(0);
  });

  it("works with 48000 sample rate", () => {
    const limits = { maxRecordingTimeSec: 120, maxSessionSizeMB: 100 };
    expect(maxRecordingSamples(limits, 48000)).toBe(120 * 48000);
  });
});
