/**
 * PadEngine — manages a 4x4 grid of sample pad slots.
 * Each slot can record a sample from mic and play it back on tap.
 */

import { Recorder } from "./Recorder";

export interface PadSlot {
  id: number;
  buffer: Float32Array | null;
  audioBuffer: AudioBuffer | null;
  status: "empty" | "recording" | "loaded";
}

export class PadEngine {
  private ctx: AudioContext;
  private inputNode: AudioNode;
  private masterNode: AudioNode;
  slots: PadSlot[] = [];
  private recorder: Recorder | null = null;
  private recordingSlot: number | null = null;
  private activeSources: Map<number, AudioBufferSourceNode> = new Map();

  onStateChange: (() => void) | null = null;

  constructor(ctx: AudioContext, inputNode: AudioNode, masterNode: AudioNode) {
    this.ctx = ctx;
    this.inputNode = inputNode;
    this.masterNode = masterNode;

    // Initialize 16 empty slots
    for (let i = 0; i < 16; i++) {
      this.slots.push({ id: i, buffer: null, audioBuffer: null, status: "empty" });
    }
  }

  /** Start recording into a pad slot. */
  async startRecording(slotId: number): Promise<void> {
    if (this.recordingSlot !== null) return;
    const slot = this.slots[slotId];
    if (!slot) return;

    this.recorder = new Recorder(this.ctx, this.inputNode);
    await this.recorder.start();
    this.recordingSlot = slotId;
    slot.status = "recording";
    this.onStateChange?.();
  }

  /** Stop recording and save buffer to the slot. */
  async stopRecording(): Promise<void> {
    if (this.recordingSlot === null || !this.recorder) return;

    const raw = await this.recorder.stop();
    this.recorder = null;
    const slot = this.slots[this.recordingSlot];
    this.recordingSlot = null;

    if (raw.length === 0) {
      slot.status = "empty";
      this.onStateChange?.();
      return;
    }

    slot.buffer = raw;
    const audioBuf = this.ctx.createBuffer(1, raw.length, this.ctx.sampleRate);
    audioBuf.copyToChannel(new Float32Array(raw), 0);
    slot.audioBuffer = audioBuf;
    slot.status = "loaded";
    this.onStateChange?.();
  }

  /** Play a pad slot (one-shot). */
  play(slotId: number): void {
    const slot = this.slots[slotId];
    if (!slot?.audioBuffer) return;

    // Stop any currently playing instance of this slot
    this.stopSlot(slotId);

    const source = this.ctx.createBufferSource();
    source.buffer = slot.audioBuffer;
    source.connect(this.masterNode);
    source.onended = () => {
      this.activeSources.delete(slotId);
    };
    source.start();
    this.activeSources.set(slotId, source);
  }

  /** Stop a playing pad slot. */
  stopSlot(slotId: number): void {
    const source = this.activeSources.get(slotId);
    if (source) {
      try { source.stop(); source.disconnect(); } catch { /* ok */ }
      this.activeSources.delete(slotId);
    }
  }

  /** Clear a pad slot. */
  clear(slotId: number): void {
    this.stopSlot(slotId);
    const slot = this.slots[slotId];
    if (slot) {
      slot.buffer = null;
      slot.audioBuffer = null;
      slot.status = "empty";
      this.onStateChange?.();
    }
  }

  /** Check if currently recording. */
  get isRecording(): boolean {
    return this.recordingSlot !== null;
  }

  get currentRecordingSlot(): number | null {
    return this.recordingSlot;
  }

  /** Import an audio buffer into a pad slot. */
  importBuffer(slotId: number, data: Float32Array): void {
    const slot = this.slots[slotId];
    if (!slot) return;
    slot.buffer = data;
    const audioBuf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    audioBuf.copyToChannel(new Float32Array(data), 0);
    slot.audioBuffer = audioBuf;
    slot.status = "loaded";
    this.onStateChange?.();
  }
}
