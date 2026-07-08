import { describe, it, expect } from "vitest"
import { computeWarpStretchRatio } from "../engine/warp/warpSync"

describe("computeWarpStretchRatio", () => {
  const base = { syncToTempo: true, nativeBeats: 8, bpm: 120, clipDurationSec: 4 }

  it("returns 1 when the clip already matches tempo", () => {
    // 8 beats @120bpm = 4s, clip is 4s → no stretch
    expect(computeWarpStretchRatio(base)).toBeCloseTo(1, 6)
  })

  it("stretches longer when tempo slows (lower bpm → longer target)", () => {
    // 8 beats @60bpm = 8s target, clip 4s → 2x
    expect(computeWarpStretchRatio({ ...base, bpm: 60 })).toBeCloseTo(2, 6)
  })

  it("compresses when tempo speeds up", () => {
    // 8 beats @240bpm = 2s target, clip 4s → 0.5x
    expect(computeWarpStretchRatio({ ...base, bpm: 240 })).toBeCloseTo(0.5, 6)
  })

  it("ignores sync when nativeBeats is unknown (0) → manual/1", () => {
    expect(computeWarpStretchRatio({ ...base, nativeBeats: 0 })).toBe(1)
    expect(computeWarpStretchRatio({ ...base, nativeBeats: 0, manualStretch: 1.5 })).toBe(1.5)
  })

  it("uses manualStretch when not tempo-synced", () => {
    expect(computeWarpStretchRatio({ ...base, syncToTempo: false, manualStretch: 0.75 })).toBe(0.75)
    expect(computeWarpStretchRatio({ ...base, syncToTempo: false })).toBe(1)
  })

  it("clamps extreme ratios and guards bad inputs", () => {
    expect(computeWarpStretchRatio({ ...base, bpm: 1 })).toBeLessThanOrEqual(8)
    expect(computeWarpStretchRatio({ ...base, clipDurationSec: 0 })).toBe(1)
    expect(computeWarpStretchRatio({ ...base, syncToTempo: false, manualStretch: 0 })).toBe(1)
  })
})
