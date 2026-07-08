import { describe, it, expect } from "vitest"
import { SCALE_MASKS, snapToScale, PITCH_SCALES } from "./scale"

describe("snapToScale (vendored)", () => {
  it("leaves in-scale degrees unchanged", () => {
    const major = SCALE_MASKS.major
    for (const deg of [0, 2, 4, 5, 7, 9, 11]) {
      expect(snapToScale(deg, major)).toBe(deg)
    }
  })

  it("snaps out-of-scale degrees to the nearest degree", () => {
    const major = SCALE_MASKS.major
    expect(snapToScale(1, major)).toBe(0) // C# → C (ties resolve to the lower)
    expect(snapToScale(6, major)).toBe(5) // F# → F
    expect(snapToScale(10, major)).toBe(9) // A# → A (9 found first at equal distance)
  })

  it("wraps near the octave up to the next root", () => {
    // within just under 12 should be allowed to snap to mask[0]+12
    expect(snapToScale(11, SCALE_MASKS.octaves)).toBe(12)
  })

  it("preserves octave offset for in-scale degrees", () => {
    expect(snapToScale(14, SCALE_MASKS.major)).toBe(14) // D one octave up (in scale)
    expect(snapToScale(-10, SCALE_MASKS.major)).toBe(-10) // in-scale below root
  })

  it("exposes the expected scale set", () => {
    expect(PITCH_SCALES).toContain("off")
    expect(Object.keys(SCALE_MASKS).sort()).toEqual(
      ["fifths", "major", "majorPent", "minor", "minorPent", "octaves"],
    )
  })
})
