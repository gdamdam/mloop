/**
 * WarpNode — wires a WarpCore into the Web Audio graph for one pad trigger.
 *
 * Prefers an AudioWorklet (audio-thread, the plain-JS mirror in
 * public/warp-worklet.js); falls back to a ScriptProcessorNode that runs the TS
 * WarpCore on the main thread (Firefox / older browsers). Loader + workletFailed
 * guard follow Recorder.ts. Warp is mono in v1 (the source's mono `buffer` is
 * warped; the downstream StereoPanner still pans it) — stereo warp would need a
 * second phase-locked core and is deferred.
 */

import { WarpCore, type WarpOptions } from "./WarpCore"

function getWorkletUrl(): string {
  const base = document.baseURI || window.location.href
  return new URL("warp-worklet.js", base).href
}

export interface WarpNodeParams {
  stretchRatio: number
  pitchSemitones: number
}

const FALLBACK_BLOCK = 1024

export class WarpNode {
  private static workletReady = false
  private static workletFailed = false
  /** True once we've fallen back to ScriptProcessorNode (UI/telemetry). */
  static get isFallback(): boolean {
    return WarpNode.workletFailed
  }

  /** Stable node the caller connects downstream (gain → panner → master). */
  readonly output: GainNode

  /** Fired once when the warped source is exhausted or stop() is called. */
  onended: (() => void) | null = null

  private readonly ctx: AudioContext
  private readonly channel: Float32Array
  private readonly options: WarpOptions
  private readonly loop: boolean
  private params: WarpNodeParams

  private worklet: AudioWorkletNode | null = null
  private script: ScriptProcessorNode | null = null
  private core: WarpCore | null = null
  private produced = 0
  private totalOut = 0
  private ended = false

  constructor(
    ctx: AudioContext,
    channel: Float32Array,
    params: WarpNodeParams,
    options: WarpOptions = {},
    loop = false,
  ) {
    this.ctx = ctx
    this.channel = channel
    this.params = { ...params }
    this.options = options
    this.loop = loop
    this.output = ctx.createGain()
  }

  private static async ensureWorklet(ctx: AudioContext): Promise<boolean> {
    if (WarpNode.workletFailed) return false
    if (WarpNode.workletReady) return true
    try {
      await ctx.audioWorklet.addModule(getWorkletUrl())
      WarpNode.workletReady = true
      return true
    } catch (err) {
      console.warn("[mloop] warp AudioWorklet unavailable, using ScriptProcessorNode fallback:", err)
      WarpNode.workletFailed = true
      return false
    }
  }

  /** Begin producing warped audio into `output`. */
  async start(): Promise<void> {
    // A scheduled start may resolve after stop() cancelled us — bail out.
    if (this.ended) return
    const canUseWorklet = await WarpNode.ensureWorklet(this.ctx)
    if (this.ended) return
    if (canUseWorklet) {
      try {
        this.worklet = new AudioWorkletNode(this.ctx, "warp-worklet", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { sampleRate: this.ctx.sampleRate, loop: this.loop, ...this.options },
        })
        this.worklet.port.onmessage = (e: MessageEvent) => {
          if (e.data?.type === "ended") this.finish()
        }
        this.worklet.port.postMessage({ type: "params", ...this.params })
        this.worklet.port.postMessage({ type: "load", channel: this.channel })
        this.worklet.connect(this.output)
        return
      } catch (err) {
        console.warn("[mloop] warp AudioWorkletNode creation failed, falling back:", err)
        WarpNode.workletFailed = true
        this.worklet = null
      }
    }
    this.startFallback()
  }

  private startFallback(): void {
    this.core = new WarpCore(this.ctx.sampleRate, this.options)
    this.core.setSource(this.channel)
    this.totalOut = this.core.outputLengthFor(this.channel.length, this.params.stretchRatio)
    this.produced = 0
    // 1 input (unconnected, ignored) + 1 output — a pure generator; connecting
    // the output downstream is what drives onaudioprocess.
    this.script = this.ctx.createScriptProcessor(FALLBACK_BLOCK, 1, 1)
    this.script.onaudioprocess = (e: AudioProcessingEvent) => {
      if (this.ended || !this.core) return
      const out = e.outputBuffer.getChannelData(0)
      this.core.render(out, this.params)
      this.produced += out.length
      if (this.produced >= this.totalOut) {
        if (this.loop) {
          this.core.reset()
          this.produced = 0
        } else {
          this.finish()
        }
      }
    }
    this.script.connect(this.output)
  }

  /** Update warp parameters live (e.g. tempo change while playing). */
  setParams(params: WarpNodeParams): void {
    this.params = { ...params }
    if (this.worklet) {
      this.worklet.port.postMessage({ type: "params", ...this.params })
    } else if (this.core) {
      this.totalOut = this.core.outputLengthFor(this.channel.length, this.params.stretchRatio)
    }
  }

  /** Stop and tear down. Idempotent; fires onended once. */
  stop(): void {
    this.finish()
  }

  private finish(): void {
    if (this.ended) return
    this.ended = true
    if (this.worklet) {
      this.worklet.port.onmessage = null
      this.worklet.port.postMessage({ type: "stop" })
      try {
        this.worklet.disconnect()
      } catch {
        /* already disconnected */
      }
      this.worklet = null
    }
    if (this.script) {
      this.script.onaudioprocess = null
      try {
        this.script.disconnect()
      } catch {
        /* already disconnected */
      }
      this.script = null
    }
    this.core = null
    const cb = this.onended
    this.onended = null
    cb?.()
  }
}
