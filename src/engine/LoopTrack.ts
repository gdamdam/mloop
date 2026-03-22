/**
 * LoopTrack — manages one loop track: buffer stack, recording,
 * playback, overdub, undo, reverse, half-speed.
 *
 * State machine: empty → recording → playing ⇄ overdubbing → stopped
 *
 * Audio is stored as a stack of Float32Array layers. On playback,
 * layers are summed into a single AudioBuffer. This layer approach
 * enables non-destructive overdub with per-layer undo.
 */

import type { TrackStatus, EffectParams, EffectName } from "../types";
import { Recorder } from "./Recorder";
import { EffectsChain } from "./EffectsChain";
import { DestructionEngine } from "./DestructionEngine";

export class LoopTrack {
  readonly id: number;
  private ctx: AudioContext;
  private inputNode: AudioNode;

  // Audio state — layers are the non-destructive overdub stack
  private layers: Float32Array[] = [];
  private mixedBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private recorder: Recorder | null = null;

  // Playback routing: outputGain → fxInput → [effects] → muteGain → master
  readonly outputGain: GainNode;
  private fxInput: GainNode;
  private muteGain: GainNode;
  readonly effects: EffectsChain;
  /** Destruction mode — progressive degradation applied each loop cycle. */
  readonly destruction = new DestructionEngine();

  // Track state
  status: TrackStatus = "empty";
  loopLengthSamples = 0;
  isReversed = false;
  playbackRate = 1;
  private _muted = false;
  private _volume = 0.8;
  private autoStopTimer: number | null = null;
  /** Input latency in samples — set by AudioEngine after mic init for trim compensation. */
  latencyTrimSamples = 0;

  /** Callback to notify engine of state changes (triggers React re-render). */
  onStateChange: (() => void) | null = null;

  constructor(id: number, ctx: AudioContext, inputNode: AudioNode, masterNode: AudioNode) {
    this.id = id;
    this.ctx = ctx;
    this.inputNode = inputNode;

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this._volume;

    // Effects chain sits between output gain and mute gate
    this.fxInput = ctx.createGain();
    this.muteGain = ctx.createGain();
    this.muteGain.gain.value = 1;

    this.outputGain.connect(this.fxInput);
    this.effects = new EffectsChain(ctx, this.fxInput, this.muteGain);
    this.muteGain.connect(masterNode);
  }

  // ── Effects passthrough ────────────────────────────────────────────────

  /** Apply effect parameter changes — delegates to the EffectsChain. */
  setEffect<K extends EffectName>(name: K, params: Partial<EffectParams[K]>): void {
    this.effects.setEffect(name, params);
  }

  /** Get a snapshot of all current effect parameters. */
  getEffects(): EffectParams {
    return this.effects.getEffects();
  }

  /** Number of overdub layers (0 = empty track). */
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

  /** Mute/unmute by zeroing the mute gate (preserves volume setting). */
  set muted(m: boolean) {
    this._muted = m;
    this.muteGain.gain.value = m ? 0 : 1;
  }

  // ── Recording ──────────────────────────────────────────────────────────

  /**
   * Start recording a new layer.
   * @param masterLength Master loop length in samples. 0 = first recording (free length).
   */
  async startRecording(masterLength: number): Promise<void> {
    this.recorder = new Recorder(this.ctx, this.inputNode);
    await this.recorder.start();
    this.status = "recording";
    this.notifyChange();

    // Auto-stop after one master loop cycle so overdubs stay aligned
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

  /**
   * Stop recording, finalize the captured buffer, and begin looped playback.
   * Applies latency compensation by trimming leading samples.
   * @returns The final loop length in samples (0 if recording was empty).
   */
  async stopRecording(masterLength: number): Promise<number> {
    if (!this.recorder) return 0;

    const raw = await this.recorder.stop();
    this.recorder = null;

    if (raw.length === 0) {
      this.status = "empty";
      this.notifyChange();
      return 0;
    }

    // Determine loop length — either from master or from this first recording
    if (masterLength > 0) {
      this.loopLengthSamples = masterLength;
    } else {
      this.loopLengthSamples = raw.length;
    }

    // Latency compensation: trim leading silence caused by audio pipeline delay,
    // then zero-pad to exact loop length for seamless looping
    const offset = Math.min(this.latencyTrimSamples, raw.length - 1);
    const compensated = offset > 0 ? raw.subarray(offset) : raw;
    const trimmed = new Float32Array(this.loopLengthSamples);
    const copyLen = Math.min(compensated.length, this.loopLengthSamples);
    trimmed.set(compensated.subarray(0, copyLen));

    this.layers.push(trimmed);
    this.rebuildMixedBuffer();
    this.startPlayback();

    return this.loopLengthSamples;
  }

  // ── Overdub ────────────────────────────────────────────────────────────

  /**
   * Start overdubbing: existing layers keep playing while a new layer records.
   * Auto-stops after one loop cycle to keep layers aligned.
   */
  async startOverdub(): Promise<void> {
    if (this.layers.length === 0) return;

    // Ensure existing content is audible during overdub
    if (this.status !== "playing") {
      this.startPlayback();
    }

    this.recorder = new Recorder(this.ctx, this.inputNode);
    await this.recorder.start();
    this.status = "overdubbing";
    this.notifyChange();

    // Auto-stop after one loop cycle — overdubs are always one cycle
    this.clearAutoStopTimer();
    const durationMs = (this.loopLengthSamples / this.ctx.sampleRate) * 1000;
    this.autoStopTimer = window.setTimeout(() => {
      this.autoStopTimer = null;
      if (this.status === "overdubbing") {
        this.stopOverdub();
      }
    }, durationMs);
  }

  /** Stop overdub, merge the new layer into the stack, and restart playback. */
  async stopOverdub(): Promise<void> {
    if (!this.recorder) return;

    const raw = await this.recorder.stop();
    this.recorder = null;

    if (raw.length > 0) {
      // Trim/pad to exact loop length for seamless alignment
      const trimmed = new Float32Array(this.loopLengthSamples);
      const copyLen = Math.min(raw.length, this.loopLengthSamples);
      trimmed.set(raw.subarray(0, copyLen));
      this.layers.push(trimmed);
      this.rebuildMixedBuffer();
    }

    // Restart playback with updated mix (includes new layer)
    this.stopSource();
    this.startPlayback();
  }

  // ── Playback ───────────────────────────────────────────────────────────

  private destructionTimer: number | null = null;

  /**
   * Start looped playback of the mixed buffer.
   * @param offsetSeconds Start position within the loop (for sync alignment).
   */
  private startPlayback(offsetSeconds = 0): void {
    if (!this.mixedBuffer) return;

    this.stopSource();

    const source = this.ctx.createBufferSource();
    source.buffer = this.mixedBuffer;
    source.loop = true;
    source.playbackRate.value = this.playbackRate;
    source.connect(this.outputGain);
    // Modulo prevents offset > duration when syncing to master
    source.start(0, offsetSeconds % (this.mixedBuffer.duration || 1));

    this.sourceNode = source;
    this.status = "playing";
    this.notifyChange();

    // Destruction mode: degrade buffer each loop cycle by stopping and restarting
    // with the modified buffer. AudioBufferSourceNode.buffer is readonly after start(),
    // so we must create a new source each cycle.
    this.startDestructionCycle();
  }

  /** Start the destruction cycle — checks every loop boundary. */
  private startDestructionCycle(): void {
    this.stopDestructionTimer();
    if (this.loopLengthSamples <= 0) return;
    const cycleDurationMs = (this.loopLengthSamples / this.ctx.sampleRate) * 1000 / this.playbackRate;
    this.destructionTimer = window.setInterval(() => {
      if (this.status !== "playing") return;
      if (this.destruction.amount <= 0) return;
      // Degrade and restart with new buffer (buffer is readonly after start)
      this.rebuildMixedBuffer();
      if (this.mixedBuffer) {
        this.stopSource();
        const source = this.ctx.createBufferSource();
        source.buffer = this.mixedBuffer;
        source.loop = true;
        source.playbackRate.value = this.playbackRate;
        source.connect(this.outputGain);
        source.start();
        this.sourceNode = source;
      }
    }, cycleDurationMs);
  }

  private stopDestructionTimer(): void {
    if (this.destructionTimer !== null) {
      clearInterval(this.destructionTimer);
      this.destructionTimer = null;
    }
  }

  /** Public play entry point — no-ops if track is empty. */
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

  /** Stop playback/recording, discard any in-progress recording. */
  stop(): void {
    this.clearAutoStopTimer();
    this.stopDestructionTimer();
    this.stopSource();
    if (this.recorder) {
      this.recorder.stop(); // discard
      this.recorder = null;
    }
    this.status = this.layers.length > 0 ? "stopped" : "empty";
    this.notifyChange();
  }

  /** Safely stop and disconnect the AudioBufferSourceNode. */
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

  /**
   * Mix all layers into a single AudioBuffer for playback.
   * Applies: layer summation → clamp → destruction degradation → reverse.
   */
  private rebuildMixedBuffer(): void {
    if (this.layers.length === 0) {
      this.mixedBuffer = null;
      return;
    }

    const len = this.loopLengthSamples;
    const mixed = new Float32Array(len);

    // Sum all layers (additive mixing)
    for (const layer of this.layers) {
      for (let i = 0; i < len; i++) {
        mixed[i] += layer[i];
      }
    }

    // Hard clamp to prevent digital clipping artifacts
    for (let i = 0; i < len; i++) {
      if (mixed[i] > 1) mixed[i] = 1;
      else if (mixed[i] < -1) mixed[i] = -1;
    }

    // Apply destruction degradation (cumulative — gets worse each cycle)
    this.destruction.degrade(mixed);

    // Reverse the buffer in-place if reverse mode is active
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

  /** Toggle reverse — rebuilds buffer and restarts playback seamlessly. */
  toggleReverse(): void {
    this.isReversed = !this.isReversed;
    this.rebuildMixedBuffer();
    if (this.status === "playing") {
      this.stopSource();
      this.startPlayback();
    }
    this.notifyChange();
  }

  /** Toggle half-speed playback (1x ↔ 0.5x). Updates live if playing. */
  toggleHalfSpeed(): void {
    this.playbackRate = this.playbackRate === 1 ? 0.5 : 1;
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.playbackRate;
    }
    this.notifyChange();
  }

  /**
   * Undo the last overdub layer. Requires at least 2 layers
   * (won't remove the base recording).
   */
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

  /** Clear all layers and reset track to pristine empty state. */
  clear(): void {
    this.clearAutoStopTimer();
    this.stopDestructionTimer();
    this.destruction.reset();
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

  /**
   * Import a decoded audio buffer as the first (and only) layer.
   * Used for file import. Respects master loop length if one exists.
   * @returns The resulting loop length in samples.
   */
  importBuffer(data: Float32Array, masterLength: number): number {
    this.clear();

    if (masterLength > 0) {
      // Conform to existing master loop length
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

  /** Get raw layers for session serialization (save/export). */
  getLayers(): Float32Array[] {
    return this.layers;
  }

  /** Restore layers from saved session data. Leaves track stopped (not auto-playing). */
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

  /** Fire the state change callback (used by React sync layer). */
  private notifyChange(): void {
    this.onStateChange?.();
  }
}
