/**
 * AudioEngine — central hub for all audio I/O and track management.
 *
 * Owns the AudioContext lifecycle, mic input routing, master output with
 * brick-wall limiter, and per-track LoopTrack instances. Also hosts the
 * TimingEngine for metronome/quantization.
 *
 * Signal flow:
 *   mic → inputGain → inputAnalyser (metering)
 *                   → monitorGain → masterGain → hpf → eqLow → eqMid → eqHigh → glueComp → glueMakeup
 *                                               → drivePre → drive → drivePost → limiter → outputTrim → analyser → destination
 *   each LoopTrack also connects to masterGain via its own chain.
 *
 * Master-bus chain (Option B layout):
 *   1. hpf        — 12 dB/oct highpass, off/20/30/40 Hz (rumble cut)
 *   2. 3-band EQ  — low shelf, mid peaking, high shelf
 *   3. glue comp  — gentle 2:1 glue, single AMOUNT knob
 *   4. drive      — tanh soft-clip waveshaper, amount 1..10
 *   5. limiter    — brick-wall, adjustable ceiling, on/off
 *   6. outputTrim — final user-facing VOL fader (post-limiter)
 */

import { LoopTrack } from "./LoopTrack";
import { TimingEngine } from "./TimingEngine";
import { encodeWavStereo } from "../utils/wav";
import { loadLimits, maxRecordingSamples } from "../utils/recordingLimits";
import { NUM_TRACKS } from "../types";
import type { TimingMode, SyncMode } from "../types";
import { projectBeat, nowMs, type LinkClock } from "../utils/linkBridge";
import {
  createMbusClient,
  type MbusClient,
  type SourceInfo,
  type Subscription,
} from "../transport/mbus";

/** What feeds the record path: the mic (default) or an mbus peer tab. */
export type InputSourceKind = "mic" | "mbus";

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
  /**
   * Current shared Link clock, or null when Link is disabled/disconnected.
   * When set, transport starts align the master loop to the shared bar grid;
   * when null, timing is unchanged from standalone behavior.
   */
  private linkClock: LinkClock | null = null;
  private inputStream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  // mbus input: receive another tab's live audio over the link-bridge (see
  // src/transport/mbus). The client is created lazily on first selection —
  // while the mic is the input source there is no client and no socket. An
  // absent bridge means an empty source list and a silent mbus input.
  private mbus: MbusClient | null = null;
  private mbusSub: Subscription | null = null;
  private mbusSources: SourceInfo[] = [];
  private mbusSourceId: string | null = null;
  private mbusSourceSubs = new Set<(s: SourceInfo[]) => void>();
  private inputKind: InputSourceKind = "mic";
  private inputGain: GainNode;
  private masterGain: GainNode;
  private hpf: BiquadFilterNode;
  private eqLow: BiquadFilterNode;
  private eqMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;
  private glueComp: DynamicsCompressorNode;
  private glueMakeup: GainNode;
  private drive: WaveShaperNode;
  private drivePre: GainNode;
  private drivePost: GainNode;
  private limiter: DynamicsCompressorNode;
  private limiterEnabled = true;
  private limiterCeiling = -1; // dB — user-adjustable output ceiling
  private outputTrim: GainNode;
  private analyser: AnalyserNode;
  private inputAnalyser: AnalyserNode;
  private resumeTimer: number | null = null;
  private monitorGain: GainNode;
  private resumeHandler: (() => void) | null = null;
  private resumeEvents = ["pointerdown", "keydown", "touchstart"];
  private isShutdown = false;

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

    // ── Master HPF (rumble cut) ──────────────────────────────────────
    // Off by default (frequency at 10 Hz is effectively inaudible).
    this.hpf = this.ctx.createBiquadFilter();
    this.hpf.type = "highpass";
    this.hpf.frequency.value = 10;
    this.hpf.Q.value = 0.707;

    // ── Master 3-band EQ ─────────────────────────────────────────────
    this.eqLow = this.ctx.createBiquadFilter();
    this.eqLow.type = "lowshelf";
    this.eqLow.frequency.value = 250;
    this.eqLow.gain.value = 0;

    this.eqMid = this.ctx.createBiquadFilter();
    this.eqMid.type = "peaking";
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1;
    this.eqMid.gain.value = 0;

    this.eqHigh = this.ctx.createBiquadFilter();
    this.eqHigh.type = "highshelf";
    this.eqHigh.frequency.value = 4000;
    this.eqHigh.gain.value = 0;

    // ── Master glue compressor ───────────────────────────────────────
    // Gentle 2:1 bus compression. AMOUNT knob drives the threshold from
    // 0 dB (no compression) down to -18 dB (heavy glue).
    this.glueComp = this.ctx.createDynamicsCompressor();
    this.glueComp.threshold.value = 0;  // off by default
    this.glueComp.ratio.value = 2;
    this.glueComp.attack.value = 0.03;
    this.glueComp.release.value = 0.25;
    this.glueComp.knee.value = 6;
    this.glueMakeup = this.ctx.createGain();
    this.glueMakeup.gain.value = 1;     // auto-compensated in setGlueAmount()

    // ── Master drive (soft-clip tanh waveshaper) ─────────────────────
    this.drivePre = this.ctx.createGain();
    this.drivePre.gain.value = 1;
    this.drive = this.ctx.createWaveShaper();
    this.drive.curve = AudioEngine.makeDriveCurve(1);
    this.drive.oversample = "2x";
    this.drivePost = this.ctx.createGain();
    this.drivePost.gain.value = 1;

    // ── Brick-wall limiter ───────────────────────────────────────────
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = this.limiterCeiling;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.limiter.knee.value = 6;

    // ── Output trim — final user-facing VOL fader ────────────────────
    this.outputTrim = this.ctx.createGain();
    this.outputTrim.gain.value = 1;

    // Output analyser for master waveform visualization
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // masterGain → hpf → eq → glueComp → glueMakeup → drive stage → limiter → outputTrim → analyser → destination
    this.masterGain.connect(this.hpf);
    this.hpf.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.glueComp);
    this.glueComp.connect(this.glueMakeup);
    this.glueMakeup.connect(this.drivePre);
    this.drivePre.connect(this.drive);
    this.drive.connect(this.drivePost);
    this.drivePost.connect(this.limiter);
    this.limiter.connect(this.outputTrim);
    this.outputTrim.connect(this.analyser);
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

    // Free-length recordings get the user-configured safety cap —
    // without it a forgotten recording grows until the tab runs out
    // of memory.
    const capSamples = recLength === 0
      ? maxRecordingSamples(loadLimits(), this.ctx.sampleRate)
      : 0;

    await track.startRecording(recLength, capSamples);
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
        track.setLoopLength(len);
      }

      // In LOCK mode, force recording to exactly the lock length
      if (this.syncMode === "lock" && len > 0) {
        const lockLen = this.getLockLength();
        track.setLoopLength(lockLen);
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
   * Position (seconds) within the master loop that the shared Link timeline is
   * currently at, or null when Link isn't driving transport / there's no loop.
   * An existing loop started at this offset is phase-locked to peers: it plays
   * from the point it *would* be at had it been running on the shared grid.
   */
  private linkedLoopOffset(): number | null {
    if (!this.linkClock || this.masterLoopLength === 0) return null;
    const loopDur = this.masterLoopLength / this.ctx.sampleRate;
    if (!(loopDur > 0) || !(this.linkClock.tempo > 0)) return null;
    const secPerBeat = 60 / this.linkClock.tempo;
    const sharedSec = projectBeat(this.linkClock, nowMs()) * secPerBeat;
    return ((sharedSec % loopDur) + loopDur) % loopDur;
  }

  /**
   * Play all tracks that have content.
   * In sync/lock modes, resets master start time so all tracks align from beat 1.
   * When a Link clock is present, tracks instead align to the shared bar grid.
   */
  playAll(): void {
    // Link-driven: align the master loop to the shared Link timeline so an
    // existing loop begins at a shared boundary with the correct loop offset.
    const linkOffset = this.linkedLoopOffset();
    if (linkOffset !== null) {
      this.masterStartTime = this.ctx.currentTime - linkOffset;
      for (const track of this.tracks) {
        if (track.layerCount > 0) track.play(linkOffset);
      }
      return;
    }

    const offset = (this.syncMode === "sync" || this.syncMode === "lock")
      ? this.getMasterOffset() : 0;

    // Reset master clock so all tracks start from the same reference point.
    // Anchor it at (now - offset) — the tracks below start `offset` deep
    // into the loop, so a clock reset to plain `now` would leave every
    // later playTrack misaligned by exactly `offset`.
    if (this.syncMode !== "free" && this.masterLoopLength > 0) {
      this.masterStartTime = this.ctx.currentTime - offset;
    }

    for (const track of this.tracks) {
      if (track.layerCount > 0) {
        track.play(this.syncMode === "free" ? 0 : offset);
      }
    }
  }

  /**
   * Set (or clear, with null) the shared Link clock that drives transport
   * alignment. Called on each bridge update; storing it is a cheap assignment
   * that never restarts playback — alignment is only applied when a transport
   * start (playAll) actually runs. Passing null restores standalone timing.
   */
  setLinkClock(clock: LinkClock | null): void {
    this.linkClock = clock;
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
    // While mbus feeds the record path, keep the mic node detached — its
    // stream stays alive so switching back to mic is instant.
    if (this.inputKind === "mic") this.inputSource.connect(this.inputGain);
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
      try { this.inputSource.disconnect(); } catch { /* already disconnected */ }
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
    if (this.inputKind === "mic") this.inputSource.connect(this.inputGain);
  }

  // ── mbus input ─────────────────────────────────────────────────────────

  /** Which live source feeds the record path: "mic" (default) or "mbus". */
  get inputSourceKind(): InputSourceKind { return this.inputKind; }

  /** Sources currently advertised on the bridge (for the mbus source picker). */
  getMbusSources(): SourceInfo[] { return this.mbusSources; }

  get mbusSelectedSourceId(): string | null { return this.mbusSourceId; }

  /** Notify on source directory changes; returns an unsubscribe fn. */
  subscribeMbusSources(cb: (s: SourceInfo[]) => void): () => void {
    this.mbusSourceSubs.add(cb);
    return () => this.mbusSourceSubs.delete(cb);
  }

  /**
   * Lazily create + connect the mbus client (idempotent). Silent if the
   * link-bridge is absent — the client retries in the background and simply
   * reports no sources, so the mbus input is available but empty.
   */
  private initMbus(): void {
    if (this.mbus) return;
    const client = createMbusClient();
    this.mbus = client;
    client.onSources((sources) => {
      this.mbusSources = sources;
      if (this.inputKind === "mbus") {
        // If the source we're recording from vanished from the directory,
        // drop to silence rather than holding a dead peer connection.
        if (this.mbusSourceId && !sources.some((s) => s.sourceId === this.mbusSourceId)) {
          this.closeMbusSub();
          this.mbusSourceId = null;
        }
        // First snapshot after the lazy connect (or after a vanished source
        // reappears): attach to the selected/first advertised source.
        if (!this.mbusSub) this.attachMbus();
      }
      for (const cb of this.mbusSourceSubs) cb(sources);
    });
    client.connect();
  }

  /** Close the WebRTC subscription (detaching its node from the record path);
   *  the client itself stays connected for discovery. */
  private closeMbusSub(): void {
    if (!this.mbusSub) return;
    try { this.mbusSub.node.disconnect(); } catch { /* already disconnected */ }
    this.mbusSub.close();
    this.mbusSub = null;
  }

  /** Subscribe to the chosen (or first advertised) source and feed it into
   *  inputGain. With no bridge / no source the input is simply silent. */
  private attachMbus(): void {
    this.closeMbusSub();
    const sourceId = this.mbusSourceId ?? this.mbusSources[0]?.sourceId ?? null;
    if (!this.mbus || !sourceId) return;
    this.mbusSourceId = sourceId;
    this.mbusSub = this.mbus.subscribe(sourceId, this.ctx);
    this.mbusSub.node.connect(this.inputGain);
  }

  /**
   * Switch what feeds inputGain (and thus recording, metering and monitoring):
   * the mic or an mbus peer. Selecting mbus lazily connects the client;
   * selecting away closes the subscription. Nothing is persisted.
   */
  setInputSource(kind: InputSourceKind): void {
    if (kind === this.inputKind) return;
    this.inputKind = kind;
    if (kind === "mbus") {
      // Detach the mic node only — its stream stays alive for instant
      // switch-back (and initMic may never have run; that's fine too).
      if (this.inputSource) {
        try { this.inputSource.disconnect(); } catch { /* already disconnected */ }
      }
      // Monitoring is normally wired in initMic; make sure the monitor path
      // exists even if the mic was denied (duplicate connects are ignored).
      this.inputGain.connect(this.monitorGain);
      this.initMbus();
      this.attachMbus();
    } else {
      this.closeMbusSub();
      this.inputSource?.connect(this.inputGain);
    }
  }

  /** Choose which mbus source feeds the input; re-subscribes live if active. */
  setMbusSource(sourceId: string): void {
    this.mbusSourceId = sourceId;
    if (this.inputKind === "mbus") this.attachMbus();
  }

  // ── Master Recording ───────────────────────────────────────────────────

  private masterRecorder: MediaRecorder | null = null;
  private masterChunks: Blob[] = [];
  private masterRecDest: MediaStreamAudioDestinationNode | null = null;
  masterRecording = false;

  /** Start recording the master output (everything going to speakers). */
  startMasterRecord(): void {
    // Reuse a single destination node — connecting a fresh one per
    // recording accumulates nodes on the analyser for the session.
    if (!this.masterRecDest) {
      this.masterRecDest = this.ctx.createMediaStreamDestination();
      this.analyser.connect(this.masterRecDest);
    }
    const dest = this.masterRecDest;
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

  // ── Master mixer accessors ───────────────────────────────────────────
  getEqLow(): BiquadFilterNode { return this.eqLow; }
  getEqMid(): BiquadFilterNode { return this.eqMid; }
  getEqHigh(): BiquadFilterNode { return this.eqHigh; }
  getLimiter(): DynamicsCompressorNode { return this.limiter; }
  getOutputTrim(): GainNode { return this.outputTrim; }

  /** HPF frequency in Hz. 10 Hz (or lower) is effective bypass. */
  setHpfFreq(hz: number) { this.hpf.frequency.value = Math.max(10, hz); }
  getHpfFreq(): number { return this.hpf.frequency.value; }

  /**
   * Glue compressor AMOUNT 0..1.
   * 0 → threshold 0 dB (no compression), 1 → threshold -18 dB (heavy glue).
   * Makeup gain applied on the glueMakeup node to compensate for level drop.
   */
  setGlueAmount(amount: number) {
    const a = Math.max(0, Math.min(1, amount));
    this.glueComp.threshold.value = -18 * a;
    // Rough auto-makeup: +3 dB at full glue.
    this.glueMakeup.gain.value = 1 + a * 0.5;
  }
  getGlueAmount(): number {
    return -this.glueComp.threshold.value / 18;
  }

  /** Toggle the brick-wall limiter between active (uses ceiling) and bypass (1:1). */
  setLimiterEnabled(on: boolean) {
    this.limiterEnabled = on;
    if (on) {
      this.limiter.threshold.value = this.limiterCeiling;
      this.limiter.ratio.value = 12;
    } else {
      this.limiter.threshold.value = 0;
      this.limiter.ratio.value = 1;
    }
  }
  isLimiterEnabled(): boolean { return this.limiterEnabled; }

  /** Limiter output ceiling in dB (default -1). Only applied when limiter is on. */
  setLimiterCeiling(dB: number) {
    this.limiterCeiling = Math.max(-24, Math.min(0, dB));
    if (this.limiterEnabled) this.limiter.threshold.value = this.limiterCeiling;
  }
  getLimiterCeiling(): number { return this.limiterCeiling; }

  /** Drive amount 1..10 — updates pre-gain, waveshaper curve, and post-gain compensation. */
  setDrive(amount: number) {
    const a = Math.max(1, Math.min(10, amount));
    this.drivePre.gain.value = a;
    this.drive.curve = AudioEngine.makeDriveCurve(a);
    this.drivePost.gain.value = 1 / Math.sqrt(a);
  }
  getDrive(): number { return this.drivePre.gain.value; }

  /** Build a tanh soft-clip curve for the master waveshaper. */
  private static makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 1024;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    const k = amount; // steeper = more clipping
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1; // -1..1
      curve[i] = Math.tanh(k * x);
    }
    return curve;
  }

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
    // Idempotent — guard against double-close (e.g. React strict-mode double
    // unmount or an explicit shutdown followed by unmount cleanup).
    if (this.isShutdown) return;
    this.isShutdown = true;

    this.timing.stop();
    if (this.resumeTimer !== null) {
      clearInterval(this.resumeTimer);
      this.resumeTimer = null;
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
      this.inputStream = null;
    }
    this.closeMbusSub();
    if (this.mbus) {
      this.mbus.disconnect();
      this.mbus = null;
    }
    try { this.ctx.close(); } catch { /* already closed */ }
  }
}
