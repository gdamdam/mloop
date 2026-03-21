/**
 * PadEngine — manages a 4x4 grid of one-shot sample pad slots.
 *
 * Each slot can record a sample from the mic and play it back
 * on tap (one-shot, not looped). Designed for drum/sample triggering
 * alongside the loop tracks. Supports hot-swapping — recording into
 * a slot replaces whatever was there.
 */

import { Recorder } from "./Recorder";

/** Represents a single pad slot's state and audio data. */
export interface PadSlot {
  id: number;
  /** Raw PCM data for serialization/export. */
  buffer: Float32Array | null;
  /** Decoded AudioBuffer for Web Audio playback. */
  audioBuffer: AudioBuffer | null;
  status: "empty" | "recording" | "loaded";
}

export class PadEngine {
  private ctx: AudioContext;
  private inputNode: AudioNode;
  private masterNode: AudioNode;
  slots: PadSlot[] = [];
  private recorder: Recorder | null = null;
  /** Which slot is currently recording (null = none). */
  private recordingSlot: number | null = null;
  /** Track active one-shot sources so we can stop them on re-trigger. */
  private activeSources: Map<number, AudioBufferSourceNode> = new Map();

  /** Callback to notify UI of state changes. */
  onStateChange: (() => void) | null = null;

  constructor(ctx: AudioContext, inputNode: AudioNode, masterNode: AudioNode) {
    this.ctx = ctx;
    this.inputNode = inputNode;
    this.masterNode = masterNode;

    // Initialize 16 empty slots (4x4 grid)
    for (let i = 0; i < 16; i++) {
      this.slots.push({ id: i, buffer: null, audioBuffer: null, status: "empty" });
    }
  }

  /** Start recording into a pad slot. Only one slot can record at a time. */
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

  /** Stop recording and save the captured buffer to the slot. */
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

    // Store both raw data (for serialization) and AudioBuffer (for playback)
    slot.buffer = raw;
    const audioBuf = this.ctx.createBuffer(1, raw.length, this.ctx.sampleRate);
    audioBuf.copyToChannel(new Float32Array(raw), 0);
    slot.audioBuffer = audioBuf;
    slot.status = "loaded";
    this.onStateChange?.();
  }

  /** Play a pad slot as a one-shot (not looped). Re-triggers stop the previous play. */
  play(slotId: number): void {
    const slot = this.slots[slotId];
    if (!slot?.audioBuffer) return;

    // Re-trigger: stop any currently playing instance of this slot
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

  /** Stop a currently playing pad slot. */
  stopSlot(slotId: number): void {
    const source = this.activeSources.get(slotId);
    if (source) {
      try { source.stop(); source.disconnect(); } catch { /* ok */ }
      this.activeSources.delete(slotId);
    }
  }

  /** Clear a pad slot — stops playback and removes the sample. */
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

  /** Check if any slot is currently recording. */
  get isRecording(): boolean {
    return this.recordingSlot !== null;
  }

  /** Get the ID of the slot currently recording (null if none). */
  get currentRecordingSlot(): number | null {
    return this.recordingSlot;
  }

  /** Import raw audio data into a pad slot (e.g., from file or session restore). */
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
