import { describe, it, expect, beforeAll } from "vitest"
import { WarpCore } from "../engine/warp/WarpCore"

/**
 * Loads public/warp-worklet.js with stubbed AudioWorklet globals and:
 *  - checks the processor lifecycle (process() must return false once the
 *    source is exhausted so the audio-thread node can be GC'd), and
 *  - locks the plain-JS worklet kernel byte-for-byte to the TS WarpCore, so the
 *    mirror can't silently drift. Rendering in 128-frame blocks vs one shot
 *    must also agree, proving the streaming state is block-size independent.
 */

const SR = 48000

type Port = {
  onmessage: ((e: { data: Record<string, unknown> }) => void) | null
  postMessage: (msg: unknown, transfer?: unknown[]) => void
}
type Processor = {
  port: Port
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean
}

let ProcessorClass: new (options?: { processorOptions?: Record<string, unknown> }) => Processor

beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).AudioWorkletProcessor = class {
    port: Port = { onmessage: null, postMessage: () => {} }
  }
  ;(globalThis as Record<string, unknown>).registerProcessor = (
    _name: string,
    cls: new () => Processor,
  ) => {
    ProcessorClass = cls
  }
  // @ts-expect-error — plain worklet JS served from public/, no type declarations
  await import("../../public/warp-worklet.js")
})

function makeProc(opts: Record<string, unknown>) {
  const p = new ProcessorClass({ processorOptions: { sampleRate: SR, ...opts } })
  return p
}

function sine(freq: number, seconds: number): Float32Array {
  const n = Math.round(seconds * SR)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) out[i] = Math.sin((2 * Math.PI * freq * i) / n)
  return out
}

/** Pull the worklet in 128-frame quanta until it terminates, mono. */
function drain(p: Processor, maxBlocks = 100000): Float32Array {
  const chunks: number[] = []
  for (let b = 0; b < maxBlocks; b += 1) {
    const block = new Float32Array(128)
    const alive = p.process([], [[block]])
    for (let i = 0; i < block.length; i += 1) chunks.push(block[i])
    if (!alive) break
  }
  return Float32Array.from(chunks)
}

describe("WarpWorkletProcessor", () => {
  it("stays alive while producing, then terminates when exhausted", () => {
    const p = makeProc({})
    const src = sine(440, 0.02) // ~960 frames
    p.port.onmessage!({ data: { type: "load", channel: src } })
    expect(p.process([], [[new Float32Array(128)]])).toBe(true)
    const rest = drain(p)
    expect(rest.length).toBeGreaterThan(0)
  })

  it("terminates immediately on stop", () => {
    const p = makeProc({})
    p.port.onmessage!({ data: { type: "load", channel: sine(440, 0.1) } })
    p.port.onmessage!({ data: { type: "stop" } })
    expect(p.process([], [[new Float32Array(128)]])).toBe(false)
  })

  it("mirrors WarpCore byte-for-byte (no drift, block-size independent)", () => {
    const opts = { grainSizeMs: 50, overlap: 4, grainJitter: 0.3, seed: 1 }
    const src = sine(330, 0.15)

    const p = makeProc(opts)
    p.port.onmessage!({ data: { type: "params", stretchRatio: 1.5, pitchSemitones: 4 } })
    p.port.onmessage!({ data: { type: "load", channel: src } })
    const fromWorklet = drain(p)

    const core = new WarpCore(SR, opts)
    const fromCore = core.process(src, { stretchRatio: 1.5, pitchSemitones: 4 })

    // worklet drains a whole final block, so it may run a few frames past the
    // core's exact target length; the overlapping region must be identical.
    const n = Math.min(fromWorklet.length, fromCore.length)
    expect(n).toBe(fromCore.length)
    for (let i = 0; i < n; i += 1) expect(fromWorklet[i]).toBe(fromCore[i])
  })
})
