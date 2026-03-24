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
import { encodeWavStereo } from "../utils/wav";
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
  lockBars: number = 4; // how many bars in LOCK mode (1, 2, 4, 8)
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
  private resumeHandler: (() => void) | null = null;
  private resumeEvents = ["pointerdown", "keydown", "touchstart"];

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
    return this.timing.barLengthSamples * this.lockBars;
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

    // Check for getUserMedia support (Firefox may not expose mediaDevices
    // on some pages or may need the legacy API)
    if (!navigator.mediaDevices?.getUserMedia) {
      // Try legacy API as fallback
      const legacyGetUserMedia = (navigator as unknown as {
        webkitGetUserMedia?: (c: MediaStreamConstraints, s: (s: MediaStream) => void, e: (e: Error) => void) => void;
        mozGetUserMedia?: (c: MediaStreamConstraints, s: (s: MediaStream) => void, e: (e: Error) => void) => void;
      }).webkitGetUserMedia || (navigator as unknown as {
        mozGetUserMedia?: (c: MediaStreamConstraints, s: (s: MediaStream) => void, e: (e: Error) => void) => void;
      }).mozGetUserMedia;

      if (legacyGetUserMedia) {
        this.inputStream = await new Promise<MediaStream>((resolve, reject) => {
          legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
        });
      } else {
        throw new Error("getUserMedia not supported in this browser");
      }
    } else {
      // Use saved device if available
      const savedDevice = localStorage.getItem("mloop-audio-device");
      const constraints: MediaStreamConstraints = {
        audio: {
          ...(savedDevice ? { deviceId: { exact: savedDevice } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };
      // Try with constraints first, fall back to simple {audio: true}
      try {
        this.inputStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Firefox may reject advanced constraints — try simple audio
        this.inputStream = await navigator.mediaDevices.getUserMedia({
          audio: savedDevice ? { deviceId: { exact: savedDevice } } : true,
        });
      }
    }

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

  /**
   * Switch to a specific audio input device by deviceId.
   * Tears down existing mic stream and reconnects with the new device.
   */
  async switchDevice(deviceId: string): Promise<void> {
    // Tear down existing input
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.inputStream) {
      for (const track of this.inputStream.getTracks()) track.stop();
      this.inputStream = null;
    }

    // Request the specific device
    try {
      this.inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      // Fallback without processing constraints
      this.inputStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
    }

    this.inputSource = this.ctx.createMediaStreamSource(this.inputStream);
    this.inputSource.connect(this.inputGain);
  }

  // ── Master Recording ───────────────────────────────────────────────────

  private masterRecorder: MediaRecorder | null = null;
  private masterChunks: Blob[] = [];
  masterRecording = false;

  /** Start recording the master output (everything going to speakers). */
  startMasterRecord(): void {
    const dest = this.ctx.createMediaStreamDestination();
    this.analyser.connect(dest);
    this.masterChunks = [];
    this.masterRecorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm" });
    this.masterRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.masterChunks.push(e.data);
    };
    this.masterRecorder.start(100);
    this.masterRecording = true;
  }

  /** Stop master recording and return the captured audio as a WAV blob. */
  async stopMasterRecord(): Promise<Blob | null> {
    if (!this.masterRecorder || this.masterRecorder.state === "inactive") {
      this.masterRecording = false;
      return null;
    }
    return new Promise((resolve) => {
      this.masterRecorder!.onstop = async () => {
        this.masterRecording = false;
        const webmBlob = new Blob(this.masterChunks, { type: "audio/webm" });
        // Decode to AudioBuffer then encode as WAV for universal compatibility
        const arrayBuf = await webmBlob.arrayBuffer();
        try {
          const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
          const channels = [];
          for (let c = 0; c < audioBuf.numberOfChannels; c++) channels.push(audioBuf.getChannelData(c));
          const wav = encodeWavStereo(channels, audioBuf.sampleRate, {
            title: "mloop master recording",
            software: "mloop — https://mloop.mpump.live",
            date: new Date().toISOString().slice(0, 10),
          });
          resolve(new Blob([wav], { type: "audio/wav" }));
        } catch {
          // Fallback: return webm if WAV encoding fails
          resolve(webmBlob);
        }
      };
      this.masterRecorder!.stop();
    });
  }

  /** Expose internal nodes for external wiring (e.g., pad engine, visualizers). */
  getInputNode(): GainNode { return this.inputGain; }

  /** Set mic gain — uses setValueAtTime for Firefox compatibility. */
  setMicGain(v: number): void {
    this.inputGain.gain.setValueAtTime(v, this.ctx.currentTime);
  }
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

  /**
   * Auto-gain: adjusts mic gain to keep signal near target level.
   * Call periodically (e.g. every 500ms). Gentle adjustment to avoid pumping.
   */
  autoGain(targetLevel = 0.3): void {
    const level = this.getInputLevel();
    if (level < 0.001) return; // no signal at all, don't adjust
    const currentGain = this.inputGain.gain.value;
    const ratio = targetLevel / Math.max(level, 0.01);
    // Gentle adjustment: move 10% toward ideal gain, clamp 0.1–10
    const newGain = Math.max(0.1, Math.min(10, currentGain + (currentGain * ratio - currentGain) * 0.1));
    this.inputGain.gain.setValueAtTime(newGain, this.ctx.currentTime);
  }

  /** Enable/disable live mic monitoring through speakers. */
  setMonitor(on: boolean): void {
    this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.015);
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
    this.resumeHandler = () => {
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    };
    for (const e of this.resumeEvents) {
      document.addEventListener(e, this.resumeHandler, { passive: true });
    }
  }

  /** Tear down everything — stops metronome, releases mic, closes AudioContext. */
  shutdown(): void {
    this.timing.stop();
    if (this.resumeTimer !== null) {
      clearInterval(this.resumeTimer);
    }
    if (this.resumeHandler) {
      for (const e of this.resumeEvents) {
        document.removeEventListener(e, this.resumeHandler);
      }
      this.resumeHandler = null;
    }
    if (this.inputStream) {
      for (const track of this.inputStream.getTracks()) {
        track.stop();
      }
    }
    this.ctx.close();
  }
}
