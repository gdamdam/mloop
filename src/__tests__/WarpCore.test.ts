// WarpCore is pure DSP — no DOM/AudioContext use. Runs under the repo's default
// vitest env (the shared setup.ts stubs AudioContext on `window`, so a node-env
// override is not viable without touching that shared setup).
import { describe, it, expect } from "vitest"
import { WarpCore } from "../engine/warp/WarpCore"

const SR = 48000

function makeSine(freq: number, seconds: number, sr = SR): Float32Array {
  const n = Math.round(seconds * sr)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) out[i] = Math.sin((2 * Math.PI * freq * i) / sr)
  return out
}

/** Goertzel-style magnitude of `buf` at `freq`, measured over the middle
 *  portion so grain-edge fades don't skew the estimate. */
function magAt(buf: Float32Array, freq: number, sr = SR): number {
  const start = Math.floor(buf.length * 0.25)
  const end = Math.floor(buf.length * 0.75)
  let re = 0
  let im = 0
  for (let i = start; i < end; i += 1) {
    const w = (2 * Math.PI * freq * i) / sr
    re += buf[i] * Math.cos(w)
    im -= buf[i] * Math.sin(w)
  }
  return Math.hypot(re, im) / (end - start)
}

function rms(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i += 1) s += buf[i] * buf[i]
  return Math.sqrt(s / Math.max(1, buf.length))
}

describe("WarpCore", () => {
  it("stretches length by stretchRatio within one grain", () => {
    const core = new WarpCore(SR)
    const input = makeSine(440, 0.5)
    for (const ratio of [0.5, 1, 1.5, 2]) {
      const out = core.process(input, { stretchRatio: ratio, pitchSemitones: 0 })
      const expected = input.length * ratio
      expect(Math.abs(out.length - expected)).toBeLessThanOrEqual(core.grainSize)
    }
  })

  it("preserves frequency when pitch=0 for any stretch", () => {
    const core = new WarpCore(SR)
    const f0 = 1000
    const input = makeSine(f0, 0.5)
    for (const ratio of [0.5, 1, 2]) {
      const out = core.process(input, { stretchRatio: ratio, pitchSemitones: 0 })
      const atF0 = magAt(out, f0)
      const atOctaveUp = magAt(out, f0 * 2)
      const atOctaveDown = magAt(out, f0 / 2)
      expect(atF0).toBeGreaterThan(atOctaveUp * 4)
      expect(atF0).toBeGreaterThan(atOctaveDown * 4)
    }
  })

  it("doubles frequency at pitch=+12 with unchanged length", () => {
    const core = new WarpCore(SR)
    const f0 = 500
    const input = makeSine(f0, 0.5)
    const out = core.process(input, { stretchRatio: 1, pitchSemitones: 12 })
    expect(Math.abs(out.length - input.length)).toBeLessThanOrEqual(core.grainSize)
    expect(magAt(out, f0 * 2)).toBeGreaterThan(magAt(out, f0) * 3)
  })

  it("halves frequency at pitch=-12", () => {
    const core = new WarpCore(SR)
    const f0 = 1000
    const input = makeSine(f0, 0.5)
    const out = core.process(input, { stretchRatio: 1, pitchSemitones: -12 })
    expect(magAt(out, f0 / 2)).toBeGreaterThan(magAt(out, f0) * 3)
  })

  it("preserves RMS within tolerance across 0.5x-2x", () => {
    const core = new WarpCore(SR)
    const input = makeSine(440, 0.5)
    const inRms = rms(input)
    for (const ratio of [0.5, 1, 1.5, 2]) {
      const out = core.process(input, { stretchRatio: ratio, pitchSemitones: 0 })
      const ratioRms = rms(out) / inRms
      expect(ratioRms).toBeGreaterThan(0.7)
      expect(ratioRms).toBeLessThan(1.3)
    }
  })

  it("keeps an impulse localized (no smear across the buffer)", () => {
    const core = new WarpCore(SR)
    const n = 24000
    const input = new Float32Array(n)
    const impulseAt = 12000
    input[impulseAt] = 1
    const out = core.process(input, { stretchRatio: 1.5, pitchSemitones: 0 })

    // locate the peak
    let peak = 0
    let peakIdx = 0
    for (let i = 0; i < out.length; i += 1) {
      const a = Math.abs(out[i])
      if (a > peak) {
        peak = a
        peakIdx = i
      }
    }
    expect(peak).toBeGreaterThan(0.1)

    // energy must be concentrated within ~one grain of the peak
    let near = 0
    let total = 0
    for (let i = 0; i < out.length; i += 1) {
      const e = out[i] * out[i]
      total += e
      if (Math.abs(i - peakIdx) <= core.grainSize) near += e
    }
    expect(near / total).toBeGreaterThan(0.9)
  })

  it("is deterministic: identical inputs -> byte-identical output", () => {
    const a = new WarpCore(SR)
    const b = new WarpCore(SR)
    const input = makeSine(440, 0.3)
    const oa = a.process(input, { stretchRatio: 1.37, pitchSemitones: 3 })
    const ob = b.process(input, { stretchRatio: 1.37, pitchSemitones: 3 })
    expect(oa.length).toBe(ob.length)
    for (let i = 0; i < oa.length; i += 1) expect(oa[i]).toBe(ob[i])
  })

  it("seeded jitter stays deterministic yet differs from no jitter", () => {
    const input = makeSine(440, 0.3)
    const clean = new WarpCore(SR, { grainJitter: 0 }).process(input, {
      stretchRatio: 1.5,
      pitchSemitones: 0,
    })
    const j1 = new WarpCore(SR, { grainJitter: 0.4, seed: 99 }).process(input, {
      stretchRatio: 1.5,
      pitchSemitones: 0,
    })
    const j2 = new WarpCore(SR, { grainJitter: 0.4, seed: 99 }).process(input, {
      stretchRatio: 1.5,
      pitchSemitones: 0,
    })
    // same seed -> identical
    expect(j1.length).toBe(j2.length)
    for (let i = 0; i < j1.length; i += 1) expect(j1[i]).toBe(j2[i])
    // jitter actually perturbs the signal
    let diff = 0
    const m = Math.min(clean.length, j1.length)
    for (let i = 0; i < m; i += 1) diff += Math.abs(clean[i] - j1[i])
    expect(diff).toBeGreaterThan(0)
  })
})
