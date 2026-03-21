/**
 * AudioEngine — manages AudioContext lifecycle, mic input, master output
 * with brick-wall limiter and analyser. Owns LoopTrack and TimingEngine.
 */

import { LoopTrack } from "./LoopTrack";
import { TimingEngine } from "./TimingEngine";
import { NUM_TRACKS } from "../types";
import type { TimingMode, SyncMode } from "../types";

const RESUME_INTERVAL_MS = 5000;

export class AudioEngine {
  ctx: AudioContext;
  tracks: LoopTrack[] = [];
  timing: TimingEngine;
  masterLoopLength = 0; // samples, set by first recording
  timingMode: TimingMode = "free";
  syncMode: SyncMode = "free";
  private masterStartTime = 0; // AudioContext time when master playback started
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
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ sampleRate: 44100 });

    // Input gain (before recording tap)
    this.inputGain = this.ctx.createGain();
    this.inputGain.gain.value = 1;

    // Input analyser for level metering
    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputGain.connect(this.inputAnalyser);

    // Monitor gain — off by default to prevent feedback
    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = 0;

    // Master output chain: masterGain → limiter → analyser → destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.limiter.knee.value = 6;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Monitor path: input → monitor gain → master
    this.monitorGain.connect(this.masterGain);

    // Timing engine (metronome clicks go to master)
    this.timing = new TimingEngine(this.ctx, this.masterGain);

    // Create loop tracks
    for (let i = 0; i < NUM_TRACKS; i++) {
      this.tracks.push(new LoopTrack(i, this.ctx, this.inputGain, this.masterGain));
    }

    this.startResumeHeartbeat();
  }

  // ── Track commands ─────────────────────────────────────────────────────

  /** Get the current offset within the master loop (seconds). Used for SYNC mode. */
  private getMasterOffset(): number {
    if (this.masterLoopLength === 0 || this.masterStartTime === 0) return 0;
    const elapsed = this.ctx.currentTime - this.masterStartTime;
    const loopDur = this.masterLoopLength / this.ctx.sampleRate;
    return elapsed % loopDur;
  }

  /** In LOCK mode, all recordings use this fixed time window. */
  private getLockLength(): number {
    if (this.masterLoopLength > 0) return this.masterLoopLength;
    // Default to 4 bars at current BPM
    return this.timing.barLengthSamples * 4;
  }

  async recordTrack(trackId: number): Promise<void> {
    const track = this.tracks[trackId];
    if (!track) return;

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

  async stopTrack(trackId: number): Promise<void> {
    const track = this.tracks[trackId];
    if (!track) return;

    if (track.status === "recording") {
      const recLength = this.syncMode === "lock"
        ? this.getLockLength()
        : this.masterLoopLength;

      let len = await track.stopRecording(recLength);

      // In quantized mode, quantize the first loop to bar boundaries
      if (this.masterLoopLength === 0 && len > 0 && this.timingMode === "quantized") {
        len = this.timing.quantizeToBar(len);
        track.loopLengthSamples = len;
      }

      // In LOCK mode, force to lock length
      if (this.syncMode === "lock" && len > 0) {
        const lockLen = this.getLockLength();
        track.loopLengthSamples = lockLen;
        len = lockLen;
      }

      // First recording sets the master loop length
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

  playTrack(trackId: number): void {
    const track = this.tracks[trackId];
    if (!track) return;

    if (this.syncMode === "sync" || this.syncMode === "lock") {
      // Start at the current master loop position
      track.play(this.getMasterOffset());
    } else {
      track.play();
    }
  }

  async overdubTrack(trackId: number): Promise<void> {
    await this.tracks[trackId]?.startOverdub();
  }

  clearTrack(trackId: number): void {
    this.tracks[trackId]?.clear();
    if (this.tracks.every((t) => t.layerCount === 0)) {
      this.masterLoopLength = 0;
      this.masterStartTime = 0;
    }
  }

  stopAll(): void {
    for (const track of this.tracks) {
      if (track.status !== "empty") {
        track.stop();
      }
    }
  }

  playAll(): void {
    const offset = (this.syncMode === "sync" || this.syncMode === "lock")
      ? this.getMasterOffset() : 0;

    // In sync/lock, reset master start so all tracks align
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

  setBpm(bpm: number): void {
    this.timing.bpm = bpm;
    // Sync BPM to all track effects chains (for tempo-synced delay)
    for (const track of this.tracks) {
      track.effects.bpm = bpm;
    }
  }

  setTimingMode(mode: TimingMode): void {
    this.timingMode = mode;
    if (mode === "quantized" && !this.timing.metronomeOn) {
      this.timing.start();
    }
  }

  toggleMetronome(): void {
    this.timing.metronomeOn = !this.timing.metronomeOn;
    if (this.timing.metronomeOn) {
      this.timing.start();
    } else {
      this.timing.stop();
    }
  }

  tapTempo(): void {
    this.timing.tapTempo();
  }

  // ── Mic / I/O ──────────────────────────────────────────────────────────

  async initMic(): Promise<void> {
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

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  getInputNode(): GainNode { return this.inputGain; }
  getMasterNode(): GainNode { return this.masterGain; }
  getAnalyser(): AnalyserNode { return this.analyser; }
  getInputAnalyser(): AnalyserNode { return this.inputAnalyser; }

  getInputLevel(): number {
    const data = new Uint8Array(this.inputAnalyser.fftSize);
    this.inputAnalyser.getByteTimeDomainData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > max) max = v;
    }
    return max;
  }

  setMonitor(on: boolean): void {
    this.monitorGain.gain.value = on ? 1 : 0;
  }

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
