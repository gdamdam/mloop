/**
 * AudioEngine — central hub for all audio I/O and track management.
 *
 * Owns the AudioContext lifecycle, mic input routing, master output with
 * brick-wall limiter, and per-track LoopTrack instances. Also hosts the
 * TimingEngine for metronome/quantization.
 *
 * Signal flow:
 *   mic → inputGain → inputAnalyser (metering)
 *                   → monitorGain → masterGain → limiter → analyser → destination
 *   each LoopTrack also connects to masterGain via its own chain.
 */

import { LoopTrack } from "./LoopTrack";
import { TimingEngine } from "./TimingEngine";
import { NUM_TRACKS } from "../types";
import type { TimingMode, SyncMode } from "../types";

/** How often to check if AudioContext got suspended (mobile browsers do this aggressively). */
const RESUME_INTERVAL_MS = 5000;

export class AudioEngine {
  ctx: AudioContext;
  tracks: LoopTrack[] = [];
  timing: TimingEngine;
  masterLoopLength = 0; // samples, set by first recording
  timingMode: TimingMode = "free";
  syncMode: SyncMode = "free";
  inputLatencySamples = 0; // measured input latency for trim compensation
  private masterStartTime = 0;
  private inputStream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode;
  private masterGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private analyser: AnalyserNode;
  private inputAnalyser: AnalyserNode;
  private resumeTimer: number | null = null;
  private monitorGain: GainNode;

  constructor() {
    // Safari compat: fall back to webkitAudioContext if needed
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ sampleRate: 44100 });

    // Input gain (before recording tap) — allows global input level control
    this.inputGain = this.ctx.createGain();
    this.inputGain.gain.value = 1;

    // Input analyser for live input level metering (UI mic meter)
    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputGain.connect(this.inputAnalyser);

    // Monitor gain — off by default to prevent feedback through speakers
    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = 0;

    // Master output chain: masterGain → limiter → analyser → destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;

    // Brick-wall limiter prevents clipping when multiple tracks stack
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.limiter.knee.value = 6;

    // Output analyser for master waveform visualization
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Monitor path: input → monitor gain → master (for headphone monitoring)
    this.monitorGain.connect(this.masterGain);

    // Timing engine (metronome clicks route through master)
    this.timing = new TimingEngine(this.ctx, this.masterGain);

    // Create loop tracks — each taps input and feeds master
    for (let i = 0; i < NUM_TRACKS; i++) {
      this.tracks.push(new LoopTrack(i, this.ctx, this.inputGain, this.masterGain));
    }

    // Keep AudioContext alive on mobile (browsers suspend after inactivity)
    this.startResumeHeartbeat();
  }

  // ── Track commands ─────────────────────────────────────────────────────

  /**
   * Get the current playback position within the master loop (seconds).
   * Used in SYNC/LOCK modes to align newly started tracks to the global position.
   */
  private getMasterOffset(): number {
    if (this.masterLoopLength === 0 || this.masterStartTime === 0) return 0;
    const elapsed = this.ctx.currentTime - this.masterStartTime;
    const loopDur = this.masterLoopLength / this.ctx.sampleRate;
    return elapsed % loopDur;
  }

  /**
   * In LOCK mode, all recordings are forced to this fixed duration.
   * Falls back to 4 bars at current BPM if no master loop exists yet.
   */
  private getLockLength(): number {
    if (this.masterLoopLength > 0) return this.masterLoopLength;
    return this.timing.barLengthSamples * 4;
  }

  /** Begin recording on a track. In quantized mode, auto-starts metronome. */
  async recordTrack(trackId: number): Promise<void> {
    const track = this.tracks[trackId];
    if (!track) return;

    // Quantized mode requires the metronome running for bar alignment
    if (this.timingMode === "quantized" && !this.timing.metronomeOn) {
      this.timing.metronomeOn = true;
      this.timing.start();
    }

    // In LOCK mode, always use the fixed time window
    const recLength = this.syncMode === "lock"
      ? this.getLockLength()
      : this.masterLoopLength;

    await track.startRecording(recLength);
  }

  /**
   * Stop recording/overdubbing/playback on a track.
   * On first recording completion, establishes the master loop length
   * that all subsequent recordings align to.
   */
  async stopTrack(trackId: number): Promise<void> {
    const track = this.tracks[trackId];
    if (!track) return;

    if (track.status === "recording") {
      const recLength = this.syncMode === "lock"
        ? this.getLockLength()
        : this.masterLoopLength;

      let len = await track.stopRecording(recLength);

      // In quantized mode, snap the first loop to bar boundaries
      // so subsequent overdubs land on musical subdivisions
      if (this.masterLoopLength === 0 && len > 0 && this.timingMode === "quantized") {
        len = this.timing.quantizeToBar(len);
        track.loopLengthSamples = len;
      }

      // In LOCK mode, force recording to exactly the lock length
      if (this.syncMode === "lock" && len > 0) {
        const lockLen = this.getLockLength();
        track.loopLengthSamples = lockLen;
        len = lockLen;
      }

      // First recording defines the master loop — all tracks reference this
      if (this.masterLoopLength === 0 && len > 0) {
        this.masterLoopLength = len;
        this.masterStartTime = this.ctx.currentTime;
      }
    } else if (track.status === "overdubbing") {
      await track.stopOverdub();
    } else {
      track.stop();
    }
  }

  /** Start playback on a track, phase-aligned to master loop in sync modes. */
  playTrack(trackId: number): void {
    const track = this.tracks[trackId];
    if (!track) return;

    if (this.syncMode === "sync" || this.syncMode === "lock") {
      // Start at the current master loop position so tracks stay in phase
      track.play(this.getMasterOffset());
    } else {
      track.play();
    }
  }

  /** Begin overdubbing (layering) on a track that already has content. */
  async overdubTrack(trackId: number): Promise<void> {
    await this.tracks[trackId]?.startOverdub();
  }

  /**
   * Clear a track's content. If all tracks become empty,
   * reset the master loop so the next recording starts fresh.
   */
  clearTrack(trackId: number): void {
    this.tracks[trackId]?.clear();
    if (this.tracks.every((t) => t.layerCount === 0)) {
      this.masterLoopLength = 0;
      this.masterStartTime = 0;
    }
  }

  /** Stop all tracks without clearing their content. */
  stopAll(): void {
    for (const track of this.tracks) {
      if (track.status !== "empty") {
        track.stop();
      }
    }
  }

  /**
   * Play all tracks that have content.
   * In sync/lock modes, resets master start time so all tracks align from beat 1.
   */
  playAll(): void {
    const offset = (this.syncMode === "sync" || this.syncMode === "lock")
      ? this.getMasterOffset() : 0;

    // Reset master clock so all tracks start from the same reference point
    if (this.syncMode !== "free" && this.masterLoopLength > 0) {
      this.masterStartTime = this.ctx.currentTime;
    }

    for (const track of this.tracks) {
      if (track.layerCount > 0) {
        track.play(this.syncMode === "free" ? 0 : offset);
      }
    }
  }

  // ── Timing ─────────────────────────────────────────────────────────────

  /** Set BPM globally — propagates to timing engine and all track effects (tempo-synced delay). */
  setBpm(bpm: number): void {
    this.timing.bpm = bpm;
    for (const track of this.tracks) {
      track.effects.bpm = bpm;
    }
  }

  /** Switch timing mode. Quantized mode auto-starts the metronome scheduler. */
  setTimingMode(mode: TimingMode): void {
    this.timingMode = mode;
    if (mode === "quantized" && !this.timing.metronomeOn) {
      this.timing.start();
    }
  }

  /** Toggle metronome audible click and scheduler on/off. */
  toggleMetronome(): void {
    this.timing.metronomeOn = !this.timing.metronomeOn;
    if (this.timing.metronomeOn) {
      this.timing.start();
    } else {
      this.timing.stop();
    }
  }

  /** Forward tap-tempo input to the timing engine. */
  tapTempo(): void {
    this.timing.tapTempo();
  }

  // ── Mic / I/O ──────────────────────────────────────────────────────────

  /**
   * Request mic access and wire up the input signal chain.
   * Disables all browser audio processing (echo cancellation, AGC, noise
   * suppression) to get a clean signal for looping.
   */
  /** Whether mic has been successfully initialized. */
  get hasMic(): boolean { return this.inputSource !== null; }

  /**
   * Request mic access and wire up input. Must be called inside a user
   * gesture (click/tap) for Firefox compatibility.
   *
   * Firefox requires AudioContext.resume() BEFORE getUserMedia — otherwise
   * the media stream connection silently fails or throws.
   */
  async initMic(): Promise<void> {
    // Resume AudioContext first — Firefox needs this inside user gesture
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.inputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.inputSource = this.ctx.createMediaStreamSource(this.inputStream);
    this.inputSource.connect(this.inputGain);
    this.inputGain.connect(this.monitorGain);

    // Measure input latency for recording compensation
    const base = (this.ctx as unknown as { baseLatency?: number }).baseLatency ?? 0;
    const output = (this.ctx as unknown as { outputLatency?: number }).outputLatency ?? 0;
    this.inputLatencySamples = Math.round((base + output) * this.ctx.sampleRate);
    for (const track of this.tracks) {
      track.latencyTrimSamples = this.inputLatencySamples;
    }
  }

  /** Expose internal nodes for external wiring (e.g., pad engine, visualizers). */
  getInputNode(): GainNode { return this.inputGain; }
  getMasterNode(): GainNode { return this.masterGain; }
  getAnalyser(): AnalyserNode { return this.analyser; }
  getInputAnalyser(): AnalyserNode { return this.inputAnalyser; }

  /**
   * Read the current input level as a 0–1 peak value.
   * Uses time-domain data (not FFT) for instantaneous amplitude.
   */
  getInputLevel(): number {
    const data = new Uint8Array(this.inputAnalyser.fftSize);
    this.inputAnalyser.getByteTimeDomainData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      // Byte time-domain data is unsigned 0–255, centered at 128
      const v = Math.abs(data[i] - 128) / 128;
      if (v > max) max = v;
    }
    return max;
  }

  /** Enable/disable live mic monitoring through speakers. */
  setMonitor(on: boolean): void {
    this.monitorGain.gain.value = on ? 1 : 0;
  }

  /**
   * Periodically resume the AudioContext and listen for user gestures.
   * Mobile browsers aggressively suspend audio contexts to save battery;
   * this heartbeat + gesture listeners ensure playback stays alive.
   */
  private startResumeHeartbeat(): void {
    const resume = () => {
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    };
    this.resumeTimer = window.setInterval(resume, RESUME_INTERVAL_MS);
    const events = ["pointerdown", "keydown", "touchstart"];
    const handler = () => {
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    };
    for (const e of events) {
      document.addEventListener(e, handler, { passive: true });
    }
  }

  /** Tear down everything — stops metronome, releases mic, closes AudioContext. */
  shutdown(): void {
    this.timing.stop();
    if (this.resumeTimer !== null) {
      clearInterval(this.resumeTimer);
    }
    if (this.inputStream) {
      for (const track of this.inputStream.getTracks()) {
        track.stop();
      }
    }
    this.ctx.close();
  }
}
