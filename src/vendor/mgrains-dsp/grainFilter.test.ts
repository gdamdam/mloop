import { describe, expect, it } from 'vitest'
import {
  clampGrainCutoff,
  GRAIN_FILTER_K,
  GRAIN_FILTER_MAX_RATIO,
  GRAIN_FILTER_MIN_HZ,
  grainFilterG,
  svfLowpass,
} from './grainFilter'

const RATES = [44_100, 48_000, 96_000]

// One-slot SVF harness around the array-based step function.
function makeSvf(cutoffHz: number, sampleRate: number) {
  const g = grainFilterG(clampGrainCutoff(cutoffHz, sampleRate), sampleRate)
  const a1 = 1 / (1 + g * (g + GRAIN_FILTER_K))
  const a2 = g * a1
  const a3 = g * a2
  const ic1 = new Float64Array(1)
  const ic2 = new Float64Array(1)
  return {
    ic1,
    ic2,
    step: (x: number) => svfLowpass(x, a1, a2, a3, ic1, ic2, 0),
  }
}

// Steady-state amplitude ratio of a sine through the filter (skip 1 settle cycle).
function sineGain(freqHz: number, cutoffHz: number, sampleRate: number): number {
  const svf = makeSvf(cutoffHz, sampleRate)
  const frames = Math.floor(sampleRate * 0.25)
  const settle = Math.floor(sampleRate / freqHz) * 4
  let peak = 0
  for (let i = 0; i < frames; i += 1) {
    const y = svf.step(Math.sin((2 * Math.PI * freqHz * i) / sampleRate))
    if (i > settle) peak = Math.max(peak, Math.abs(y))
  }
  return peak
}

describe('grainFilter (Simper SVF, lowpass)', () => {
  it('exposes the tuned resonance constant (k = 1/Q, Q ~1.2-1.5 musical band)', () => {
    expect(GRAIN_FILTER_K).toBeGreaterThanOrEqual(1 / 1.5)
    expect(GRAIN_FILTER_K).toBeLessThanOrEqual(1 / 1.2)
  })

  it('rings: peaks above unity near the cutoff (resonant bump ~= Q)', () => {
    const gain = sineGain(1_000, 1_000, 48_000)
    expect(gain).toBeGreaterThan(1.1) // clearly resonant
    expect(gain).toBeLessThan(1.6) // but musical, not screaming
  })

  it('passes well below cutoff at ~unity and attenuates 2 octaves above by > 20 dB', () => {
    expect(sineGain(100, 1_000, 48_000)).toBeCloseTo(1, 1)
    // 2-pole lowpass: |H(4fc)| ~ 1/16 asymptotic; assert < 0.1 (-20 dB) with margin.
    expect(sineGain(4_000, 1_000, 48_000)).toBeLessThan(0.1)
  })

  it('clamps cutoff to [GRAIN_FILTER_MIN_HZ, 0.22 * sampleRate] at every rate', () => {
    expect(GRAIN_FILTER_MIN_HZ).toBe(20)
    expect(GRAIN_FILTER_MAX_RATIO).toBe(0.22)
    for (const sr of RATES) {
      expect(clampGrainCutoff(0, sr)).toBe(20)
      expect(clampGrainCutoff(1e9, sr)).toBe(0.22 * sr)
      const g = grainFilterG(clampGrainCutoff(1e9, sr), sr)
      expect(Number.isFinite(g)).toBe(true)
      expect(g).toBeGreaterThan(0)
    }
  })

  it('is stable at min cutoff x fixed resonance across 44.1/48/96 kHz (1 s of seeded noise)', () => {
    for (const sr of RATES) {
      const svf = makeSvf(GRAIN_FILTER_MIN_HZ, sr)
      let state = 0x1234_5678 // inline xorshift so the input is deterministic
      let bounded = true
      for (let i = 0; i < sr; i += 1) {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        state >>>= 0
        const y = svf.step((state / 0x1_0000_0000) * 2 - 1)
        if (!Number.isFinite(y) || Math.abs(y) > 4) {
          bounded = false
          break
        }
      }
      expect(bounded, `sr=${sr}`).toBe(true)
      expect(Number.isFinite(svf.ic1[0]) && Number.isFinite(svf.ic2[0])).toBe(true)
    }
  })

  it('decays an impulse to (sub)denormal territory without ever producing NaN', () => {
    const svf = makeSvf(200, 48_000)
    let sawNaN = false
    let last = svf.step(1)
    for (let i = 0; i < 96_000; i += 1) {
      last = svf.step(0)
      if (Number.isNaN(last)) {
        sawNaN = true
        break
      }
    }
    expect(sawNaN).toBe(false)
    expect(Math.abs(last)).toBeLessThan(1e-6) // fully decayed, states finite
    expect(Number.isFinite(svf.ic1[0]) && Number.isFinite(svf.ic2[0])).toBe(true)
  })
})
