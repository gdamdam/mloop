import { grainWindow } from "../../vendor/mgrains-dsp/windows"
import { XorShift32 } from "../../vendor/mgrains-dsp/rng"

/**
 * WarpCore — framework-free granular time-stretch + pitch-shift.
 *
 * Ports the *technique* from mgrains' GranularCore (windowed overlap-add of a
 * fixed grain pool, per-grain resample `step = 2^(semitones/12)`, linear-
 * interpolated fractional reads) into a classic OLA time-stretch configuration:
 * pitch and time are fully independent. This is NOT a phase-vocoder, NOT WSOLA,
 * and NOT the whole GranularCore (no FX rack / LFOs / contracts coupling).
 *
 * Why granular OLA: it decouples pitch from time with a handful of leaf
 * primitives we already vendor. The trade-off (inherent to non-WSOLA granular)
 * is that at stretch != 1 a hard transient is duplicated across the grain
 * overlap and tonal material can comb-filter slightly; a small seeded grain
 * jitter (off by default) breaks the comb periodicity when needed.
 *
 * The core is stateful and streaming: `render()` fills an output block with
 * zero allocation (grain pool is pre-sized in the constructor) so a worklet can
 * call it per 128-frame quantum; `process()` is an offline convenience that
 * renders a whole buffer in one shot (used by the tests).
 */

export interface WarpOptions {
  /** Grain length in milliseconds (window size). Default 50ms. */
  grainSizeMs?: number
  /** Grain overlap factor (grains active at once ≈ this). Default 4. */
  overlap?: number
  /**
   * Grain-origin jitter as a fraction of the analysis hop [0..1]. Default 0.3.
   * Fixed-hop granular overlap-add combs (and at some frequency/ratio combos
   * nulls the fundamental entirely) once pitch/stretch decorrelate the grains;
   * a small seeded jitter breaks that periodicity into broadband. 0 = off.
   */
  grainJitter?: number
  /** RNG seed for jitter; determinism holds per seed. Default 1. */
  seed?: number
}

export interface WarpParams {
  /** Output length / input length. >1 = longer/slower, <1 = shorter/faster. */
  stretchRatio: number
  /** Pitch offset in semitones; independent of stretch. */
  pitchSemitones: number
}

const EPSILON = 1e-6

export class WarpCore {
  readonly sampleRate: number
  readonly grainSize: number
  readonly hopOut: number

  private readonly grainJitter: number
  private readonly seed: number
  private readonly rng: XorShift32

  // pre-sized grain pool (parallel arrays; no per-frame allocation)
  private readonly maxGrains: number
  private readonly active: Uint8Array
  private readonly origin: Float64Array // source frame at grain start
  private readonly age: Float64Array // output frames since spawn
  private readonly grainStep: Float64Array // captured 2^(pitch/12) at spawn

  private source: Float32Array = new Float32Array(0)
  private srcHead = 0 // source read position for the next grain
  private outFrame = 0 // running output frame counter
  private nextSpawn = 0 // output frame at which to spawn the next grain

  constructor(sampleRate: number, options: WarpOptions = {}) {
    this.sampleRate = sampleRate
    const grainMs = options.grainSizeMs ?? 50
    const overlap = Math.max(2, Math.round(options.overlap ?? 4))
    // force an even grain size so hopOut divides cleanly
    this.grainSize = Math.max(2, Math.round((grainMs * 0.001 * sampleRate) / 2) * 2)
    this.hopOut = Math.max(1, Math.round(this.grainSize / overlap))
    this.grainJitter = Math.min(1, Math.max(0, options.grainJitter ?? 0.3))
    this.seed = options.seed ?? 1
    this.rng = new XorShift32(this.seed)

    // enough slots for full overlap plus jitter slack and a spare for stealing
    this.maxGrains = overlap + 4
    this.active = new Uint8Array(this.maxGrains)
    this.origin = new Float64Array(this.maxGrains)
    this.age = new Float64Array(this.maxGrains)
    this.grainStep = new Float64Array(this.maxGrains)
  }

  /** Reset streaming state and point the core at a new source buffer. */
  setSource(source: Float32Array): void {
    this.source = source
    this.reset()
  }

  /** Reset streaming state (keeps the current source) and reseed the RNG. */
  reset(): void {
    this.active.fill(0)
    this.srcHead = 0
    this.outFrame = 0
    this.nextSpawn = 0
    this.rng.reset(this.seed)
  }

  /** Output frames produced so far since the last reset/setSource. */
  get renderedFrames(): number {
    return this.outFrame
  }

  /** Expected output length for a source of `inputLength` at `stretchRatio`. */
  outputLengthFor(inputLength: number, stretchRatio: number): number {
    return Math.max(1, Math.round(inputLength * stretchRatio))
  }

  /**
   * Fill `out` with warped audio, advancing internal state. Zero allocation.
   * Safe to call repeatedly with successive blocks (streaming).
   */
  render(out: Float32Array, params: WarpParams): void {
    const stretch = params.stretchRatio > EPSILON ? params.stretchRatio : EPSILON
    const step = 2 ** (params.pitchSemitones / 12)
    const hopIn = this.hopOut / stretch
    const src = this.source
    const srcLen = src.length
    const N = this.grainSize

    for (let f = 0; f < out.length; f += 1) {
      if (this.outFrame >= this.nextSpawn) {
        this.spawn(step)
        this.srcHead += hopIn
        this.nextSpawn += this.hopOut
      }

      let sum = 0
      let wsq = 0
      for (let g = 0; g < this.maxGrains; g += 1) {
        if (!this.active[g]) continue
        const a = this.age[g]
        const win = grainWindow("hann", a / N)
        if (win > 0) {
          const pos = this.origin[g] + a * this.grainStep[g]
          sum += readLinear(src, pos, srcLen) * win
          wsq += win * win
        }
        this.age[g] = a + 1
        if (this.age[g] >= N) this.active[g] = 0
      }

      // power-preserving normalization: grains overlap phase-incoherently once
      // pitch/stretch/jitter decorrelate them, so dividing by sqrt(Σwin²) keeps
      // RMS constant (mirrors GranularCore's 1/sqrt(overlap) gain). Amplitude
      // normalization (÷Σwin) would thin tonal material toward metallic.
      const norm = Math.sqrt(wsq)
      out[f] = norm > EPSILON ? sum / norm : 0
      this.outFrame += 1
    }
  }

  /**
   * Offline one-shot: warp an entire buffer and return a fresh Float32Array.
   * Convenience for tests and non-streaming callers.
   */
  process(input: Float32Array, params: WarpParams): Float32Array {
    this.setSource(input)
    const len = this.outputLengthFor(input.length, params.stretchRatio)
    const out = new Float32Array(len)
    this.render(out, params)
    return out
  }

  private spawn(step: number): void {
    const slot = this.findSlot()
    let origin = this.srcHead
    if (this.grainJitter > 0) {
      // ±(jitter * hop) seeded offset breaks comb-filter periodicity
      origin += this.rng.nextBipolar() * this.grainJitter * this.hopOut
    }
    this.active[slot] = 1
    this.origin[slot] = origin
    this.age[slot] = 0
    this.grainStep[slot] = step
  }

  /** First free slot, else steal the oldest (largest age). */
  private findSlot(): number {
    let oldest = 0
    let oldestAge = -1
    for (let g = 0; g < this.maxGrains; g += 1) {
      if (!this.active[g]) return g
      if (this.age[g] > oldestAge) {
        oldestAge = this.age[g]
        oldest = g
      }
    }
    return oldest
  }
}

/** Linear-interpolated read; returns 0 outside [0, len). */
function readLinear(buf: Float32Array, pos: number, len: number): number {
  if (pos < 0 || pos >= len) return 0
  const i0 = Math.floor(pos)
  const frac = pos - i0
  const s0 = buf[i0]
  const s1 = i0 + 1 < len ? buf[i0 + 1] : 0
  return s0 + (s1 - s0) * frac
}
