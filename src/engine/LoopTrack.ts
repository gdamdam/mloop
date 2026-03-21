/**
 * LoopTrack — manages one loop track: buffer stack, recording,
 * playback, overdub, undo, reverse, half-speed.
 *
 * State machine: empty → recording → playing ⇄ overdubbing → stopped
 */

import type { TrackStatus, EffectParams, EffectName } from "../types";
import { Recorder } from "./Recorder";
import { EffectsChain } from "./EffectsChain";

export class LoopTrack {
  readonly id: number;
  private ctx: AudioContext;
  private inputNode: AudioNode;

  // Audio state
  private layers: Float32Array[] = [];
  private mixedBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private recorder: Recorder | null = null;

  // Playback nodes: outputGain → effectsChain → muteGain → master
  readonly outputGain: GainNode;
  private fxInput: GainNode;
  private muteGain: GainNode;
  readonly effects: EffectsChain;

  // Track state
  status: TrackStatus = "empty";
  loopLengthSamples = 0;
  isReversed = false;
  playbackRate = 1;
  private _muted = false;
  private _volume = 0.8;
  private autoStopTimer: number | null = null;

  // Callback to notify engine of state changes
  onStateChange: (() => void) | null = null;

  constructor(id: number, ctx: AudioContext, inputNode: AudioNode, masterNode: AudioNode) {
    this.id = id;
    this.ctx = ctx;
    this.inputNode = inputNode;

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this._volume;

    // Effects chain sits between output gain and mute
    this.fxInput = ctx.createGain();
    this.muteGain = ctx.createGain();
    this.muteGain.gain.value = 1;

    this.outputGain.connect(this.fxInput);
    this.effects = new EffectsChain(ctx, this.fxInput, this.muteGain);
    this.muteGain.connect(masterNode);
  }

  // ── Effects passthrough ────────────────────────────────────────────────

  setEffect<K extends EffectName>(name: K, params: Partial<EffectParams[K]>): void {
    this.effects.setEffect(name, params);
  }

  getEffects(): EffectParams {
    return this.effects.getEffects();
  }

  get layerCount(): number {
    return this.layers.length;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = v;
    this.outputGain.gain.value = v;
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(m: boolean) {
    this._muted = m;
    this.muteGain.gain.value = m ? 0 : 1;
  }

  // ── Recording ──────────────────────────────────────────────────────────

  /** Start recording a new layer. masterLength=0 means first recording (free length). */
  async startRecording(masterLength: number): Promise<void> {
    this.recorder = new Recorder(this.ctx, this.inputNode);
    await this.recorder.start();
    this.status = "recording";
    this.notifyChange();

    // If we have a master loop length, auto-stop after that duration
    if (masterLength > 0) {
      this.clearAutoStopTimer();
      const durationMs = (masterLength / this.ctx.sampleRate) * 1000;
      this.autoStopTimer = window.setTimeout(() => {
        this.autoStopTimer = null;
        if (this.status === "recording") {
          this.stopRecording(masterLength);
        }
      }, durationMs);
    }
  }

  /** Stop recording, finalize buffer, start playback. Returns the loop length in samples. */
  async stopRecording(masterLength: number): Promise<number> {
    if (!this.recorder) return 0;

    const raw = await this.recorder.stop();
    this.recorder = null;

    if (raw.length === 0) {
      this.status = "empty";
      this.notifyChange();
      return 0;
    }

    // Determine loop length
    if (masterLength > 0) {
      // Trim or pad to master length (or nearest multiple)
      this.loopLengthSamples = masterLength;
    } else {
      // First recording: this sets the master length
      this.loopLengthSamples = raw.length;
    }

    // Trim/pad the recorded buffer to loop length
    const trimmed = new Float32Array(this.loopLengthSamples);
    const copyLen = Math.min(raw.length, this.loopLengthSamples);
    trimmed.set(raw.subarray(0, copyLen));

    this.layers.push(trimmed);
    this.rebuildMixedBuffer();
    this.startPlayback();

    return this.loopLengthSamples;
  }

  // ── Overdub ────────────────────────────────────────────────────────────

  /** Start overdubbing: play existing + record new layer. */
  async startOverdub(): Promise<void> {
    if (this.layers.length === 0) return;

    // Ensure playback is running
    if (this.status !== "playing") {
      this.startPlayback();
    }

    this.recorder = new Recorder(this.ctx, this.inputNode);
    await this.recorder.start();
    this.status = "overdubbing";
    this.notifyChange();

    // Auto-stop after one loop cycle
    this.clearAutoStopTimer();
    const durationMs = (this.loopLengthSamples / this.ctx.sampleRate) * 1000;
    this.autoStopTimer = window.setTimeout(() => {
      this.autoStopTimer = null;
      if (this.status === "overdubbing") {
        this.stopOverdub();
      }
    }, durationMs);
  }

  /** Stop overdub, merge new layer. */
  async stopOverdub(): Promise<void> {
    if (!this.recorder) return;

    const raw = await this.recorder.stop();
    this.recorder = null;

    if (raw.length > 0) {
      const trimmed = new Float32Array(this.loopLengthSamples);
      const copyLen = Math.min(raw.length, this.loopLengthSamples);
      trimmed.set(raw.subarray(0, copyLen));
      this.layers.push(trimmed);
      this.rebuildMixedBuffer();
    }

    // Restart playback with updated mix
    this.stopSource();
    this.startPlayback();
  }

  // ── Playback ───────────────────────────────────────────────────────────

  private startPlayback(offsetSeconds = 0): void {
    if (!this.mixedBuffer) return;

    this.stopSource();

    const source = this.ctx.createBufferSource();
    source.buffer = this.mixedBuffer;
    source.loop = true;
    source.playbackRate.value = this.playbackRate;
    source.connect(this.outputGain);
    // Start at offset within the loop for sync alignment
    source.start(0, offsetSeconds % (this.mixedBuffer.duration || 1));

    this.sourceNode = source;
    this.status = "playing";
    this.notifyChange();
  }

  play(offsetSeconds = 0): void {
    if (this.layers.length === 0) return;
    this.startPlayback(offsetSeconds);
  }

  private clearAutoStopTimer(): void {
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
  }

  stop(): void {
    this.clearAutoStopTimer();
    this.stopSource();
    if (this.recorder) {
      this.recorder.stop(); // discard
      this.recorder = null;
    }
    this.status = this.layers.length > 0 ? "stopped" : "empty";
    this.notifyChange();
  }

  private stopSource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch { /* already stopped */ }
      this.sourceNode = null;
    }
  }

  // ── Buffer operations ──────────────────────────────────────────────────

  /** Mix all layers into a single AudioBuffer for playback. */
  private rebuildMixedBuffer(): void {
    if (this.layers.length === 0) {
      this.mixedBuffer = null;
      return;
    }

    const len = this.loopLengthSamples;
    const mixed = new Float32Array(len);

    for (const layer of this.layers) {
      for (let i = 0; i < len; i++) {
        mixed[i] += layer[i];
      }
    }

    // Clamp to [-1, 1]
    for (let i = 0; i < len; i++) {
      if (mixed[i] > 1) mixed[i] = 1;
      else if (mixed[i] < -1) mixed[i] = -1;
    }

    // Apply reverse if active
    let finalData = mixed;
    if (this.isReversed) {
      finalData = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        finalData[i] = mixed[len - 1 - i];
      }
    }

    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    buf.copyToChannel(finalData, 0);
    this.mixedBuffer = buf;
  }

  /** Toggle reverse — rebuilds buffer and restarts playback. */
  toggleReverse(): void {
    this.isReversed = !this.isReversed;
    this.rebuildMixedBuffer();
    if (this.status === "playing") {
      this.stopSource();
      this.startPlayback();
    }
    this.notifyChange();
  }

  /** Toggle half-speed playback. */
  toggleHalfSpeed(): void {
    this.playbackRate = this.playbackRate === 1 ? 0.5 : 1;
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.playbackRate;
    }
    this.notifyChange();
  }

  /** Undo last overdub layer. */
  undoLastLayer(): void {
    if (this.layers.length < 2) return;
    this.layers.pop();
    this.rebuildMixedBuffer();
    if (this.status === "playing") {
      this.stopSource();
      this.startPlayback();
    }
    this.notifyChange();
  }

  /** Clear all layers and reset. */
  clear(): void {
    this.clearAutoStopTimer();
    this.stopSource();
    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }
    this.layers = [];
    this.mixedBuffer = null;
    this.loopLengthSamples = 0;
    this.isReversed = false;
    this.playbackRate = 1;
    this.status = "empty";
    this.notifyChange();
  }

  /** Import a decoded audio buffer as the first layer. */
  importBuffer(data: Float32Array, masterLength: number): number {
    this.clear();

    if (masterLength > 0) {
      // Trim/pad to master length
      this.loopLengthSamples = masterLength;
      const trimmed = new Float32Array(masterLength);
      const copyLen = Math.min(data.length, masterLength);
      trimmed.set(data.subarray(0, copyLen));
      this.layers.push(trimmed);
    } else {
      this.loopLengthSamples = data.length;
      this.layers.push(new Float32Array(data));
    }

    this.rebuildMixedBuffer();
    this.startPlayback();
    return this.loopLengthSamples;
  }

  /** Get raw layers for session serialization. */
  getLayers(): Float32Array[] {
    return this.layers;
  }

  /** Restore layers from session data. */
  restoreLayers(layers: Float32Array[], loopLength: number): void {
    this.clear();
    this.layers = layers;
    this.loopLengthSamples = loopLength;
    if (layers.length > 0) {
      this.rebuildMixedBuffer();
      this.status = "stopped";
    }
    this.notifyChange();
  }

  /** Get the mixed buffer data for waveform visualization. */
  getMixedData(): Float32Array | null {
    if (!this.mixedBuffer) return null;
    return this.mixedBuffer.getChannelData(0);
  }

  private notifyChange(): void {
    this.onStateChange?.();
  }
}
