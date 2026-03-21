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
export type PadPlayMode = "one" | "gate" | "loop";

export interface PadSlot {
  id: number;
  name: string;
  buffer: Float32Array | null;
  audioBuffer: AudioBuffer | null;
  status: "empty" | "recording" | "loaded";
  // Per-pad settings
  volume: number;     // 0–1
  pan: number;        // -1 (L) to 1 (R)
  pitch: number;      // semitones (-12 to +12)
  playMode: PadPlayMode;
  trimStart: number;  // 0–1 fraction of buffer
  trimEnd: number;    // 0–1 fraction of buffer
  loopBeats: number;  // 0 = free, >0 = musical length in beats
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
      this.slots.push({
        id: i, name: "", buffer: null, audioBuffer: null, status: "empty",
        volume: 1, pan: 0, pitch: 0, playMode: "one", trimStart: 0, trimEnd: 1, loopBeats: 0,
      });
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

    slot.name = `Rec ${slot.id + 1}`;
    slot.buffer = raw;
    const audioBuf = this.ctx.createBuffer(1, raw.length, this.ctx.sampleRate);
    audioBuf.copyToChannel(new Float32Array(raw), 0);
    slot.audioBuffer = audioBuf;
    slot.status = "loaded";
    this.onStateChange?.();
  }

  /** Play a pad slot as a one-shot. Re-triggers stop the previous instance. */
  play(slotId: number): void {
    this.playAt(slotId, 0);
  }

  /**
   * Schedule a pad to play at a specific AudioContext time.
   * Applies per-pad volume, pan, pitch, trim, and play mode.
   */
  playAt(slotId: number, when: number): void {
    const slot = this.slots[slotId];
    if (!slot?.audioBuffer) return;

    this.stopSlot(slotId);

    const source = this.ctx.createBufferSource();
    source.buffer = slot.audioBuffer;

    // Pitch: semitone offset via playbackRate
    if (slot.pitch !== 0) {
      source.playbackRate.value = Math.pow(2, slot.pitch / 12);
    }

    // Loop mode
    if (slot.playMode === "loop") {
      source.loop = true;
      source.loopStart = slot.trimStart * slot.audioBuffer.duration;
      source.loopEnd = slot.trimEnd * slot.audioBuffer.duration;
    }

    // Per-pad gain
    const gain = this.ctx.createGain();
    gain.gain.value = slot.volume;

    // Per-pad pan
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = slot.pan;

    source.connect(gain).connect(panner).connect(this.masterNode);
    source.onended = () => { this.activeSources.delete(slotId); };

    // Apply trim: start at trimStart offset, play for trimmed duration
    const offset = slot.trimStart * slot.audioBuffer.duration;
    const duration = (slot.trimEnd - slot.trimStart) * slot.audioBuffer.duration;
    if (slot.playMode === "loop") {
      source.start(when, offset);
    } else {
      source.start(when, offset, duration);
    }

    this.activeSources.set(slotId, source);
  }

  // ── Built-in sequencer (Web Audio scheduled) ──────────────────────────

  private seqGrid: boolean[][] = [];
  private seqNumSteps = 16;
  private seqPlaying = false;
  private seqBpm = 120;
  private seqStepIndex = 0;
  private seqNextStepTime = 0; // AudioContext seconds
  private seqSchedulerId: number | null = null;
  private seqLookaheadSec = 0.1;  // schedule 100ms ahead
  private seqIntervalMs = 25;     // check every 25ms

  /** Callback to notify UI of current step (for visual indicator). */
  onStepChange: ((step: number) => void) | null = null;

  /** Update sequencer grid from UI. */
  setSeqGrid(grid: boolean[][]): void { this.seqGrid = grid; }
  setSeqNumSteps(n: number): void { this.seqNumSteps = n; }
  setSeqBpm(bpm: number): void { this.seqBpm = bpm; }

  /** Start sequencer with Web Audio look-ahead scheduling. */
  startSequencer(): void {
    if (this.seqPlaying) return;
    this.seqPlaying = true;
    this.seqStepIndex = 0;
    this.seqNextStepTime = this.ctx.currentTime;
    this.seqSchedule(); // schedule first batch immediately
    this.seqSchedulerId = window.setInterval(() => this.seqSchedule(), this.seqIntervalMs);
  }

  /** Stop sequencer. */
  stopSequencer(): void {
    this.seqPlaying = false;
    if (this.seqSchedulerId !== null) {
      clearInterval(this.seqSchedulerId);
      this.seqSchedulerId = null;
    }
    this.onStepChange?.(-1);
  }

  get isSeqPlaying(): boolean { return this.seqPlaying; }

  /**
   * Look-ahead scheduler — schedules all steps within the lookahead window.
   * Audio triggers are scheduled at exact AudioContext times (sample-accurate).
   * UI step indicator updated via setTimeout for visual sync.
   */
  private seqSchedule(): void {
    const stepDur = 60 / this.seqBpm / 4; // 16th note in seconds
    const horizon = this.ctx.currentTime + this.seqLookaheadSec;

    while (this.seqNextStepTime < horizon) {
      const step = this.seqStepIndex;
      const when = this.seqNextStepTime;

      // Schedule pad triggers at exact audio time
      const row = this.seqGrid[step];
      if (row) {
        for (let s = 0; s < 16; s++) {
          if (row[s]) this.playAt(s, when);
        }
      }

      // Schedule UI update (approximate — visual only)
      const delayMs = Math.max(0, (when - this.ctx.currentTime) * 1000);
      setTimeout(() => this.onStepChange?.(step), delayMs);

      this.seqStepIndex = (step + 1) % this.seqNumSteps;
      this.seqNextStepTime += stepDur;
    }
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
      slot.name = "";
      slot.buffer = null;
      slot.audioBuffer = null;
      slot.status = "empty";
      slot.volume = 1;
      slot.pan = 0;
      slot.pitch = 0;
      slot.playMode = "one";
      slot.trimStart = 0;
      slot.trimEnd = 1;
      slot.loopBeats = 0;
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
  importBuffer(slotId: number, data: Float32Array, name?: string): void {
    const slot = this.slots[slotId];
    if (!slot) return;
    slot.name = name || `Pad ${slotId + 1}`;
    slot.buffer = data;
    const audioBuf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    audioBuf.copyToChannel(new Float32Array(data), 0);
    slot.audioBuffer = audioBuf;
    slot.status = "loaded";
    this.onStateChange?.();
  }
}
