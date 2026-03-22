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
  muteGroup: number;  // 0 = none, 1-4 = group (playing one stops others in group)
}

/** Mute group presets for common drum kits. */
export const DEFAULT_MUTE_GROUPS: Record<string, number> = {
  "Hi-Hat": 1, "HH": 1, "Closed HH": 1, "Open HH": 1, "Tick HH": 1, "Soft HH": 1,
};

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
  /** Callback for count-in UI (beats remaining, 0 = recording started). */
  onCountIn: ((beatsLeft: number) => void) | null = null;
  /** Count-in beats before recording (0 = immediate, 4 = 1 bar, 8 = 2 bars). */
  countInBeats = 4;
  private countInTimer: number | null = null;

  constructor(ctx: AudioContext, inputNode: AudioNode, masterNode: AudioNode) {
    this.ctx = ctx;
    this.inputNode = inputNode;
    this.masterNode = masterNode;

    // Initialize 16 empty slots (4x4 grid)
    for (let i = 0; i < 16; i++) {
      this.slots.push({
        id: i, name: "", buffer: null, audioBuffer: null, status: "empty",
        volume: 1, pan: 0, pitch: 0, playMode: "one", trimStart: 0, trimEnd: 1, loopBeats: 0, muteGroup: 0,
      });
    }
  }

  /** Play a metronome click (for count-in). */
  private playClick(when: number, isDownbeat: boolean): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = isDownbeat ? 1500 : 1000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isDownbeat ? 0.4 : 0.3, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
    osc.connect(gain).connect(this.masterNode);
    osc.start(when);
    osc.stop(when + 0.04);
  }

  /** Cancel any active count-in. */
  cancelCountIn(): void {
    if (this.countInTimer !== null) {
      clearInterval(this.countInTimer);
      this.countInTimer = null;
    }
    this.onCountIn?.(0);
  }

  /**
   * Start recording with count-in. Plays metronome clicks for countInBeats,
   * then starts actual recording. Metronome stops when recording begins.
   * If countInBeats is 0, starts immediately.
   */
  async startRecording(slotId: number, bpm = 120): Promise<void> {
    if (this.recordingSlot !== null) return;
    const slot = this.slots[slotId];
    if (!slot) return;

    // No count-in — start immediately
    if (this.countInBeats <= 0) {
      return this.startRecordingNow(slotId);
    }

    // Count-in: schedule clicks and start recording after
    const beatDur = 60 / bpm;
    let beatsLeft = this.countInBeats;

    // Notify UI of count-in start
    slot.status = "recording"; // show visual early so user knows it's armed
    this.onCountIn?.(beatsLeft);
    this.onStateChange?.();

    // Play first click immediately
    this.playClick(this.ctx.currentTime, true);
    beatsLeft--;
    this.onCountIn?.(beatsLeft);

    // Schedule remaining clicks
    this.countInTimer = window.setInterval(() => {
      if (beatsLeft <= 0) {
        // Count-in done — start recording
        this.cancelCountIn();
        this.startRecordingNow(slotId);
        return;
      }
      const isDownbeat = beatsLeft % 4 === 0;
      this.playClick(this.ctx.currentTime, isDownbeat);
      beatsLeft--;
      this.onCountIn?.(beatsLeft);
    }, beatDur * 1000);
  }

  /** Actually start recording (after count-in). */
  private async startRecordingNow(slotId: number): Promise<void> {
    const slot = this.slots[slotId];
    if (!slot) return;
    this.recorder = new Recorder(this.ctx, this.inputNode);
    await this.recorder.start();
    this.recordingSlot = slotId;
    slot.status = "recording";
    this.onCountIn?.(0); // signal UI that recording is active
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

    // Auto-trim silence: remove leading silence, cap trailing silence to 1s
    const threshold = 0.01;
    let firstSound = 0;
    for (let i = 0; i < raw.length; i++) {
      if (Math.abs(raw[i]) > threshold) { firstSound = i; break; }
    }
    let lastSound = raw.length - 1;
    for (let i = raw.length - 1; i >= 0; i--) {
      if (Math.abs(raw[i]) > threshold) { lastSound = i; break; }
    }
    const tailSamples = Math.min(this.ctx.sampleRate, raw.length - lastSound - 1);
    const trimmed = raw.slice(firstSound, lastSound + tailSamples + 1);

    slot.name = `Rec ${slot.id + 1}`;
    slot.buffer = trimmed;
    const audioBuf = this.ctx.createBuffer(1, trimmed.length, this.ctx.sampleRate);
    audioBuf.copyToChannel(new Float32Array(trimmed), 0);
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
  playAt(slotId: number, when: number, velocity = 1): void {
    const slot = this.slots[slotId];
    if (!slot?.audioBuffer) return;

    // Mute group: stop any other pad in the same group (e.g. hat choke)
    if (slot.muteGroup > 0) {
      for (const s of this.slots) {
        if (s.id !== slotId && s.muteGroup === slot.muteGroup) {
          this.stopSlot(s.id);
        }
      }
    }

    this.stopSlot(slotId);

    const source = this.ctx.createBufferSource();
    source.buffer = slot.audioBuffer;

    // Pitch: semitone offset via playbackRate (always set, even for 0)
    source.playbackRate.value = Math.pow(2, slot.pitch / 12);

    // Loop mode
    if (slot.playMode === "loop") {
      source.loop = true;
      source.loopStart = slot.trimStart * slot.audioBuffer.duration;
      source.loopEnd = slot.trimEnd * slot.audioBuffer.duration;
    }

    // Per-pad gain × velocity
    const gain = this.ctx.createGain();
    gain.gain.value = slot.volume * velocity;

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
  private seqNextStepTime = 0;
  private seqSchedulerId: number | null = null;
  private seqLookaheadSec = 0.1;
  private seqIntervalMs = 25;
  /** Swing amount 0–1 (0=straight, 0.5=triplet, 1=max swing). */
  private seqSwing = 0;
  /** Roll interval timer for repeat mode. */
  private rollTimer: number | null = null;

  /** Callback to notify UI of current step (for visual indicator). */
  onStepChange: ((step: number) => void) | null = null;
  /** Called when sequencer triggers a pad — for UI flash feedback. */
  onPadTrigger: ((padIds: number[]) => void) | null = null;

  /** Update sequencer grid from UI. */
  setSeqGrid(grid: boolean[][]): void { this.seqGrid = grid; }
  setSeqNumSteps(n: number): void { this.seqNumSteps = n; }
  setSeqBpm(bpm: number): void { this.seqBpm = bpm; }
  setSeqSwing(swing: number): void { this.seqSwing = Math.max(0, Math.min(1, swing)); }
  getSeqSwing(): number { return this.seqSwing; }

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
      // Swing: delay odd 16th notes (every other step) by swing amount
      const swingOffset = (step % 2 === 1) ? stepDur * this.seqSwing * 0.7 : 0;
      const when = this.seqNextStepTime + swingOffset;

      // Schedule pad triggers at exact audio time
      const row = this.seqGrid[step];
      const triggered: number[] = [];
      if (row) {
        for (let s = 0; s < 16; s++) {
          if (row[s]) { this.playAt(s, when); triggered.push(s); }
        }
      }

      const delayMs = Math.max(0, (when - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        this.onStepChange?.(step);
        if (triggered.length > 0) this.onPadTrigger?.(triggered);
      }, delayMs);

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
      slot.muteGroup = 0;
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

  // ── Pad copy/swap ─────────────────────────────────────────────────────

  /** Copy pad A's buffer and settings to pad B. */
  copyPad(fromId: number, toId: number): void {
    const from = this.slots[fromId];
    const to = this.slots[toId];
    if (!from || !to || !from.buffer) return;
    this.importBuffer(toId, new Float32Array(from.buffer), from.name);
    to.volume = from.volume;
    to.pan = from.pan;
    to.pitch = from.pitch;
    to.playMode = from.playMode;
    to.trimStart = from.trimStart;
    to.trimEnd = from.trimEnd;
    to.loopBeats = from.loopBeats;
    to.muteGroup = from.muteGroup;
    this.onStateChange?.();
  }

  /** Swap two pads (buffers + all settings). */
  swapPads(aId: number, bId: number): void {
    const a = this.slots[aId];
    const b = this.slots[bId];
    if (!a || !b) return;
    // Swap all fields except id
    const keys: (keyof PadSlot)[] = ["name", "buffer", "audioBuffer", "status", "volume", "pan", "pitch", "playMode", "trimStart", "trimEnd", "loopBeats", "muteGroup"];
    for (const k of keys) {
      const tmp = a[k];
      (a as unknown as Record<string, unknown>)[k] = b[k];
      (b as unknown as Record<string, unknown>)[k] = tmp;
    }
    this.onStateChange?.();
  }

  // ── Roll/repeat mode ──────────────────────────────────────────────────

  /** Start rolling (rapid-fire retriggering) a pad at the given rate. */
  startRoll(slotId: number, rateHz: number, velocity = 1): void {
    this.stopRoll();
    const intervalMs = 1000 / rateHz;
    this.playAt(slotId, 0, velocity);
    this.rollTimer = window.setInterval(() => {
      this.playAt(slotId, 0, velocity);
    }, intervalMs);
  }

  /** Stop rolling. */
  stopRoll(): void {
    if (this.rollTimer !== null) {
      clearInterval(this.rollTimer);
      this.rollTimer = null;
    }
  }

  // ── Resample (record master output to a pad) ──────────────────────────

  private resampleDest: MediaStreamAudioDestinationNode | null = null;
  private resampleRecorder: MediaRecorder | null = null;
  private resampleChunks: Blob[] = [];
  private resampleSlotId = 0;

  /** Start recording the master output into a pad. */
  startResample(slotId: number): void {
    this.resampleSlotId = slotId;
    this.resampleDest = this.ctx.createMediaStreamDestination();
    this.masterNode.connect(this.resampleDest);
    this.resampleChunks = [];
    this.resampleRecorder = new MediaRecorder(this.resampleDest.stream);
    this.resampleRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.resampleChunks.push(e.data);
    };
    this.resampleRecorder.start();
    this.onStateChange?.();
  }

  /** Stop resampling, decode, and load into the target pad. */
  async stopResample(): Promise<void> {
    if (!this.resampleRecorder || !this.resampleDest) return;
    const recorder = this.resampleRecorder;
    const dest = this.resampleDest;

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    try { this.masterNode.disconnect(dest); } catch { /* ok */ }

    // Decode the recorded blob
    const blob = new Blob(this.resampleChunks, { type: "audio/webm" });
    const arrayBuf = await blob.arrayBuffer();
    const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
    // Mono downmix
    const len = audioBuf.length;
    const mono = new Float32Array(len);
    for (let ch = 0; ch < audioBuf.numberOfChannels; ch++) {
      const data = audioBuf.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] += data[i];
    }
    if (audioBuf.numberOfChannels > 1) {
      for (let i = 0; i < len; i++) mono[i] /= audioBuf.numberOfChannels;
    }

    this.importBuffer(this.resampleSlotId, mono, `Resample ${this.resampleSlotId + 1}`);
    this.resampleRecorder = null;
    this.resampleDest = null;
    this.resampleChunks = [];
  }

  get isResampling(): boolean { return this.resampleRecorder !== null; }

  // ── Chromatic mode ────────────────────────────────────────────────────

  /**
   * Load a single sample across all 16 pads at different pitches.
   * Maps pads to semitones from -7 to +8 relative to the root.
   */
  loadChromatic(buffer: Float32Array, rootName: string): void {
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    for (let i = 0; i < 16; i++) {
      const semitones = i - 7; // pad 0 = -7st, pad 7 = 0 (root), pad 15 = +8st
      this.importBuffer(i, new Float32Array(buffer), `${rootName} ${NOTE_NAMES[(7 + semitones + 120) % 12]}`);
      this.slots[i].pitch = semitones;
    }
  }
}
