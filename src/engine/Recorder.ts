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
  /** Guards against a second concurrent stop() clobbering resolveBuffer / stacking timeouts. */
  private stopping = false;
  private stopTimeout: ReturnType<typeof setTimeout> | null = null;
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
        this.chunks = [];
        this.totalSamples = 0;
        this.workletNode.port.onmessage = this.onWorkletMessage;
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

  /**
   * Handles worklet port messages. The worklet transfers each filled ~5s
   * chunk here as it fills (instead of retaining it on the audio thread) and
   * we send a same-size buffer back, so the worklet never allocates inside
   * process() — allocation there caused GC hitches / audible clicks.
   * On "buffer" (stop) the worklet sends only the unfilled tail; the full
   * recording is assembled here, off the audio thread.
   */
  private onWorkletMessage = (e: MessageEvent): void => {
    const data = e.data as { type: string; buffer: Float32Array };
    if (data.type === "chunk") {
      this.chunks.push(data.buffer);
      this.totalSamples += data.buffer.length;
      const replacement = new ArrayBuffer(data.buffer.byteLength);
      this.workletNode?.port.postMessage({ type: "replace", buffer: replacement }, [replacement]);
    } else if (data.type === "buffer") {
      if (this.stopTimeout !== null) {
        clearTimeout(this.stopTimeout);
        this.stopTimeout = null;
      }
      const tail = data.buffer;
      const result = new Float32Array(this.totalSamples + tail.length);
      let offset = 0;
      for (const chunk of this.chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      result.set(tail, offset);
      this.chunks = [];
      this.totalSamples = 0;
      this.resolveBuffer?.(result);
      this.resolveBuffer = null;
      this.cleanup();
    }
  };

  /** Stop recording and return the captured buffer. */
  stop(): Promise<Float32Array> {
    return new Promise((resolve) => {
      // A second concurrent stop() while the worklet is still draining would
      // overwrite resolveBuffer (orphaning the first promise) and stack a
      // second 3s timeout. Make the redundant call a no-op.
      if (this.stopping) {
        resolve(new Float32Array(0));
        return;
      }

      // AudioWorklet path
      if (this.workletNode) {
        this.stopping = true;
        this.resolveBuffer = resolve;

        // Safety timeout — if worklet doesn't respond in 3s, resolve with empty buffer
        this.stopTimeout = setTimeout(() => {
          console.warn("[mloop] AudioWorklet stop timed out");
          this.stopTimeout = null;
          this.resolveBuffer = null;
          this.chunks = [];
          this.totalSamples = 0;
          this.cleanup();
          resolve(new Float32Array(0));
        }, 3000);

        // Re-assign the shared handler (already set by start(); a chunk can
        // still arrive between "stop" and the final "buffer", so stop() must
        // not swap in a buffer-only handler that would drop it)
        this.workletNode.port.onmessage = this.onWorkletMessage;
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
    this.stopping = false;
    this.mode = "none";
  }
}
