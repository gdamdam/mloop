import { describe, it, expect } from "vitest";
import { roundTripLatencyMs } from "../utils/latency";

describe("roundTripLatencyMs", () => {
  it("sums baseLatency and outputLatency (both present)", () => {
    // 0.005 s + 0.012 s = 0.017 s → 17 ms
    expect(roundTripLatencyMs({ baseLatency: 0.005, outputLatency: 0.012 })).toBeCloseTo(17, 5);
  });

  it("uses outputLatency alone when baseLatency is absent", () => {
    expect(roundTripLatencyMs({ outputLatency: 0.02 })).toBeCloseTo(20, 5);
  });

  it("uses baseLatency alone when outputLatency is absent", () => {
    expect(roundTripLatencyMs({ baseLatency: 0.008 })).toBeCloseTo(8, 5);
  });

  it("returns 0 when both fields are absent", () => {
    expect(roundTripLatencyMs({})).toBe(0);
  });

  it("returns 0 for a null/undefined context", () => {
    expect(roundTripLatencyMs(null)).toBe(0);
    expect(roundTripLatencyMs(undefined)).toBe(0);
  });
});
