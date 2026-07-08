/**
 * WarpWorkletProcessor — runs on the audio thread.
 *
 * A thin transport around the WarpCore granular time-stretch/pitch-shift
 * algorithm: it streams a source buffer (posted over `port`) through a grain
 * overlap-add kernel and writes warped audio to its single output. Like the
 * recorder worklet, this is a plain-JS MIRROR of the TS core (mloop convention;
 * we do NOT bundle TS into the worklet). The mirrored kernel below must stay
 * byte-for-byte equivalent to src/engine/warp/WarpCore.ts — the parity test in
 * src/__tests__/warpWorklet.test.ts locks the two together.
 *
 * Zero allocation in process(): the grain pool is sized once in the kernel
 * constructor; render() writes straight into the output block.
 */

const EPSILON = 1e-6

// --- mirror of vendored windows.grainWindow('hann', …) ---
function hann(phase) {
  if (!(phase > 0) || phase >= 1) return 0
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase)
}

// --- mirror of vendored rng.XorShift32 ---
const FALLBACK_SEED = 0x9e3779b9
class XorShift32 {
  constructor(seed) {
    this.state = XorShift32.norm(seed)
  }
  reset(seed) {
    this.state = XorShift32.norm(seed)
  }
  nextUint() {
    let v = this.state
    v ^= v << 13
    v ^= v >>> 17
    v ^= v << 5
    this.state = v >>> 0
    return this.state
  }
  nextFloat() {
    return this.nextUint() / 0x1_0000_0000
  }
  nextBipolar() {
    return this.nextFloat() * 2 - 1
  }
  static norm(seed) {
    const n = Number.isFinite(seed) ? seed >>> 0 : FALLBACK_SEED
    return n === 0 ? FALLBACK_SEED : n
  }
}

function readLinear(buf, pos, len) {
  if (pos < 0 || pos >= len) return 0
  const i0 = Math.floor(pos)
  const frac = pos - i0
  const s0 = buf[i0]
  const s1 = i0 + 1 < len ? buf[i0 + 1] : 0
  return s0 + (s1 - s0) * frac
}

// --- mirror of WarpCore ---
class WarpKernel {
  constructor(sr, options = {}) {
    const grainMs = options.grainSizeMs ?? 50
    const overlap = Math.max(2, Math.round(options.overlap ?? 4))
    this.grainSize = Math.max(2, Math.round((grainMs * 0.001 * sr) / 2) * 2)
    this.hopOut = Math.max(1, Math.round(this.grainSize / overlap))
    this.grainJitter = Math.min(1, Math.max(0, options.grainJitter ?? 0.3))
    this.seed = options.seed ?? 1
    this.rng = new XorShift32(this.seed)
    this.maxGrains = overlap + 4
    this.active = new Uint8Array(this.maxGrains)
    this.origin = new Float64Array(this.maxGrains)
    this.age = new Float64Array(this.maxGrains)
    this.grainStep = new Float64Array(this.maxGrains)
    this.source = new Float32Array(0)
    this.srcHead = 0
    this.outFrame = 0
    this.nextSpawn = 0
  }

  setSource(source) {
    this.source = source
    this.reset()
  }

  reset() {
    this.active.fill(0)
    this.srcHead = 0
    this.outFrame = 0
    this.nextSpawn = 0
    this.rng.reset(this.seed)
  }

  outputLengthFor(inputLength, stretchRatio) {
    return Math.max(1, Math.round(inputLength * stretchRatio))
  }

  findSlot() {
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

  spawn(step) {
    const slot = this.findSlot()
    let origin = this.srcHead
    if (this.grainJitter > 0) {
      origin += this.rng.nextBipolar() * this.grainJitter * this.hopOut
    }
    this.active[slot] = 1
    this.origin[slot] = origin
    this.age[slot] = 0
    this.grainStep[slot] = step
  }

  render(out, stretchRatio, pitchSemitones) {
    const stretch = stretchRatio > EPSILON ? stretchRatio : EPSILON
    const step = 2 ** (pitchSemitones / 12)
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
        const win = hann(a / N)
        if (win > 0) {
          const pos = this.origin[g] + a * this.grainStep[g]
          sum += readLinear(src, pos, srcLen) * win
          wsq += win * win
        }
        this.age[g] = a + 1
        if (this.age[g] >= N) this.active[g] = 0
      }
      const norm = Math.sqrt(wsq)
      out[f] = norm > EPSILON ? sum / norm : 0
      this.outFrame += 1
    }
  }
}

class WarpWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    // `sampleRate` is a global in AudioWorkletGlobalScope; opts.sampleRate is a
    // test-only override so the kernel can be built off the audio thread.
    const sr = opts.sampleRate ?? (typeof sampleRate !== "undefined" ? sampleRate : 48000)
    this.kernel = new WarpKernel(sr, opts)
    this.stretchRatio = 1
    this.pitchSemitones = 0
    this.playing = false
    this.stopped = false
    this.produced = 0
    this.totalOut = 0

    this.port.onmessage = (e) => {
      const d = e.data
      if (d.type === "load") {
        this.kernel.setSource(d.channel)
        this.totalOut = this.kernel.outputLengthFor(d.channel.length, this.stretchRatio)
        this.produced = 0
        this.playing = true
      } else if (d.type === "params") {
        if (typeof d.stretchRatio === "number") this.stretchRatio = d.stretchRatio
        if (typeof d.pitchSemitones === "number") this.pitchSemitones = d.pitchSemitones
        // recompute expected length against the (possibly new) stretch
        this.totalOut = this.kernel.outputLengthFor(this.kernel.source.length, this.stretchRatio)
      } else if (d.type === "stop") {
        this.playing = false
        this.stopped = true
      }
    }
  }

  process(_inputs, outputs) {
    if (this.stopped) return false
    const out = outputs[0]
    if (!this.playing || !out || out.length === 0) return true

    const ch0 = out[0]
    this.kernel.render(ch0, this.stretchRatio, this.pitchSemitones)
    for (let c = 1; c < out.length; c += 1) out[c].set(ch0)
    this.produced += ch0.length

    if (this.produced >= this.totalOut) {
      this.port.postMessage({ type: "ended" })
      this.playing = false
      // Each trigger gets a fresh node; let this processor die so it doesn't
      // pin the audio thread (mirrors the recorder worklet).
      this.stopped = true
      return false
    }
    return true
  }
}

registerProcessor("warp-worklet", WarpWorkletProcessor)
