/**
 * Recorder — captures mic input into a Float32Array.
 *
 * Tries AudioWorklet first (sample-accurate, audio thread).
 * Falls back to ScriptProcessorNode if worklet fails (Firefox compat).
 * Tracks which mode is active for UI feedback.
 */

// Resolve worklet URL relative to page base (works on subpaths like /mloop/)
function getWorkletUrl(): string {
  const base = document.baseURI || window.location.href;
  return new URL("recorder-worklet.js", base).href;
}

export type RecorderMode = "worklet" | "fallback" | "none";

export class Recorder {
  private ctx: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private inputNode: AudioNode;
  private resolveBuffer: ((buf: Float32Array) => void) | null = null;
  private static workletReady = false;
  private static workletFailed = false;
  private chunks: Float32Array[] = [];
  private totalSamples = 0;

  /** Which recording mode is active — exposed for UI indicators. */
  mode: RecorderMode = "none";

  /** True if using ScriptProcessorNode fallback instead of AudioWorklet. */
  static get isFallback(): boolean { return Recorder.workletFailed; }

  constructor(ctx: AudioContext, inputNode: AudioNode) {
    this.ctx = ctx;
    this.inputNode = inputNode;
  }

  /**
   * Load the worklet module (once).
   * Adds cache-busting param to prevent Firefox from serving a stale cached version.
   */
  private async ensureWorklet(): Promise<boolean> {
    if (Recorder.workletFailed) return false;
    if (Recorder.workletReady) return true;
    try {
      const url = getWorkletUrl();
      await this.ctx.audioWorklet.addModule(url);
      Recorder.workletReady = true;
      return true;
    } catch (err) {
      console.warn("[mloop] AudioWorklet unavailable, using ScriptProcessorNode fallback:", err);
      Recorder.workletFailed = true;
      return false;
    }
  }

  /** Start recording. Uses AudioWorklet or ScriptProcessorNode fallback. */
  async start(): Promise<void> {
    const canUseWorklet = await this.ensureWorklet();

    if (canUseWorklet) {
      try {
        this.workletNode = new AudioWorkletNode(this.ctx, "recorder-worklet", {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
        });
        this.inputNode.connect(this.workletNode);
        this.workletNode.port.postMessage({ type: "start" });
        this.mode = "worklet";
        return;
      } catch (err) {
        // Worklet node creation failed — fall through to ScriptProcessor
        console.warn("[mloop] AudioWorkletNode creation failed, falling back:", err);
        Recorder.workletFailed = true;
        this.workletNode = null;
      }
    }

    // Fallback: ScriptProcessorNode (deprecated but universally supported)
    this.chunks = [];
    this.totalSamples = 0;
    this.scriptNode = this.ctx.createScriptProcessor(4096, 1, 1);
    this.scriptNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.chunks.push(copy);
      this.totalSamples += copy.length;
    };
    this.inputNode.connect(this.scriptNode);
    // ScriptProcessorNode requires connection to destination to process,
    // but route through a silent gain to avoid sending mic input to speakers
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    this.scriptNode.connect(silent);
    silent.connect(this.ctx.destination);
    this.mode = "fallback";
  }

  /** Stop recording and return the captured buffer. */
  stop(): Promise<Float32Array> {
    return new Promise((resolve) => {
      // AudioWorklet path
      if (this.workletNode) {
        this.resolveBuffer = resolve;

        // Safety timeout — if worklet doesn't respond in 3s, resolve with empty buffer
        const timeout = setTimeout(() => {
          console.warn("[mloop] AudioWorklet stop timed out");
          this.resolveBuffer = null;
          this.cleanup();
          resolve(new Float32Array(0));
        }, 3000);

        this.workletNode.port.onmessage = (e: MessageEvent) => {
          if (e.data.type === "buffer") {
            clearTimeout(timeout);
            this.resolveBuffer?.(e.data.buffer as Float32Array);
            this.resolveBuffer = null;
            this.cleanup();
          }
        };
        this.workletNode.port.postMessage({ type: "stop" });
        return;
      }

      // ScriptProcessorNode fallback path
      if (this.scriptNode) {
        this.scriptNode.onaudioprocess = null;
        try {
          this.inputNode.disconnect(this.scriptNode);
          this.scriptNode.disconnect();
        } catch { /* already disconnected */ }
        this.scriptNode = null;

        // Assemble chunks into final buffer
        const result = new Float32Array(this.totalSamples);
        let offset = 0;
        for (const chunk of this.chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        this.chunks = [];
        this.totalSamples = 0;
        this.mode = "none";
        resolve(result);
        return;
      }

      // Nothing was recording
      this.mode = "none";
      resolve(new Float32Array(0));
    });
  }

  private cleanup(): void {
    if (this.workletNode) {
      try {
        this.inputNode.disconnect(this.workletNode);
      } catch { /* already disconnected */ }
      this.workletNode = null;
    }
    this.mode = "none";
  }
}
