/**
 * Recorder — main-thread wrapper around the RecorderWorkletProcessor.
 * Connects to the input node, captures audio into a Float32Array.
 */

import workletUrl from "./recorder-worklet.ts?url";

export class Recorder {
  private ctx: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private inputNode: AudioNode;
  private resolveBuffer: ((buf: Float32Array) => void) | null = null;
  private static workletReady = false;

  constructor(ctx: AudioContext, inputNode: AudioNode) {
    this.ctx = ctx;
    this.inputNode = inputNode;
  }

  /** Load the worklet module (once per AudioContext). */
  private async ensureWorklet(): Promise<void> {
    if (Recorder.workletReady) return;
    await this.ctx.audioWorklet.addModule(workletUrl);
    Recorder.workletReady = true;
  }

  /** Start recording. Returns immediately. */
  async start(): Promise<void> {
    await this.ensureWorklet();

    this.workletNode = new AudioWorkletNode(this.ctx, "recorder-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });

    this.inputNode.connect(this.workletNode);
    this.workletNode.port.postMessage({ type: "start" });
  }

  /** Stop recording and return the captured buffer. */
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

  private cleanup(): void {
    if (this.workletNode) {
      try {
        this.inputNode.disconnect(this.workletNode);
      } catch { /* already disconnected */ }
      this.workletNode = null;
    }
  }
}
