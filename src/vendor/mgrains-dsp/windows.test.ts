import { describe, expect, it } from 'vitest'
import { grainWindow } from './windows'

describe('grainWindow', () => {
  it('keeps smooth windows closed at both endpoints', () => {
    expect(grainWindow('hann', 0)).toBe(0)
    expect(grainWindow('hann', 0.5)).toBeCloseTo(1)
    expect(grainWindow('hann', 1)).toBe(0)
  })

  it('mirrors percussive and reverse envelopes', () => {
    expect(grainWindow('percussive', 0.2)).toBeCloseTo(grainWindow('reverse', 0.8))
  })

  it('morph with zero skew/hardness reduces to Hann', () => {
    for (const phase of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(grainWindow('morph', phase, 0, 0)).toBeCloseTo(grainWindow('hann', phase))
    }
  })

  it('morph hardness 1 is a flat top inside the grain', () => {
    expect(grainWindow('morph', 0, 0, 1)).toBe(0)
    expect(grainWindow('morph', 0.5, 0, 1)).toBe(1)
    expect(grainWindow('morph', 0.99, 0, 1)).toBe(1)
    expect(grainWindow('morph', 1, 0, 1)).toBe(0)
  })

  it('morph skew shifts weight between attack and decay', () => {
    // Positive skew -> fast attack, long decay: energy sits early in the grain.
    expect(grainWindow('morph', 0.1, 1, 0)).toBeGreaterThan(grainWindow('morph', 0.9, 1, 0))
    // Negative skew is the mirror image: energy sits late.
    expect(grainWindow('morph', 0.9, -1, 0)).toBeGreaterThan(grainWindow('morph', 0.1, -1, 0))
    // Symmetric skew keeps the two ends balanced.
    expect(grainWindow('morph', 0.2, 0, 0)).toBeCloseTo(grainWindow('morph', 0.8, 0, 0))
  })
})
