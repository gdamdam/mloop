/**
 * Recorder — main-thread interface to the AudioWorklet-based recorder.
 *
 * Uses an AudioWorkletProcessor (running on the audio thread) to capture
 * raw PCM samples with zero latency. The worklet accumulates samples in
 * a ring buffer and sends them back as a single Float32Array on stop.
 *
 * This approach avoids ScriptProcessorNode (deprecated, runs on main thread)
 * and MediaRecorder (compressed, not sample-accurate).
 */

// Worklet JS lives in public/ — Vite serves static files from there
const WORKLET_URL = "./recorder-worklet.js";

export class Recorder {
  private ctx: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private inputNode: AudioNode;
  private resolveBuffer: ((buf: Float32Array) => void) | null = null;
  /** Module only needs to be registered once per AudioContext. */
  private static workletReady = false;

  constructor(ctx: AudioContext, inputNode: AudioNode) {
    this.ctx = ctx;
    this.inputNode = inputNode;
  }

  /** Load the worklet module (idempotent — skips if already loaded). */
  private async ensureWorklet(): Promise<void> {
    if (Recorder.workletReady) return;
    await this.ctx.audioWorklet.addModule(WORKLET_URL);
    Recorder.workletReady = true;
  }

  /** Start recording. Wires input → worklet node. Returns immediately. */
  async start(): Promise<void> {
    await this.ensureWorklet();

    this.workletNode = new AudioWorkletNode(this.ctx, "recorder-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 0, // sink only — no passthrough needed
      channelCount: 1,     // mono recording
    });

    this.inputNode.connect(this.workletNode);
    this.workletNode.port.postMessage({ type: "start" });
  }

  /**
   * Stop recording and return the captured buffer.
   * Communicates with the worklet via MessagePort — the worklet
   * concatenates its internal chunks and sends the full buffer back.
   */
  stop(): Promise<Float32Array> {
    return new Promise((resolve) => {
      if (!this.workletNode) {
        resolve(new Float32Array(0));
        return;
      }

      this.resolveBuffer = resolve;

      this.workletNode.port.onmessage = (e: MessageEvent) => {
        if (e.data.type === "buffer") {
          this.resolveBuffer?.(e.data.buffer as Float32Array);
          this.resolveBuffer = null;
          this.cleanup();
        }
      };

      this.workletNode.port.postMessage({ type: "stop" });
    });
  }

  /** Disconnect the worklet node from the input to free resources. */
  private cleanup(): void {
    if (this.workletNode) {
      try {
        this.inputNode.disconnect(this.workletNode);
      } catch { /* already disconnected */ }
      this.workletNode = null;
    }
  }
}
