/**
 * TimingEngine — master clock with look-ahead scheduling.
 *
 * Provides metronome clicks and quantized record boundaries.
 * Uses the standard Web Audio look-ahead pattern: a JS setInterval
 * scheduler runs ahead of the audio thread, scheduling events into
 * the future. This avoids timing jitter from JS event loop delays.
 *
 * Ported from mpump Sequencer.ts timing pattern.
 */

/** How far ahead (ms) to schedule audio events. Larger = more stable, more latency. */
const LOOKAHEAD_MS = 100;
/** How often (ms) the scheduler checks for upcoming beats. Must be < LOOKAHEAD_MS. */
const SCHEDULE_INTERVAL_MS = 25;

export class TimingEngine {
  private ctx: AudioContext;
  private masterNode: AudioNode;
  private _bpm = 120;
  private beatsPerBar = 4;
  private running = false;
  private schedulerId: number | null = null;
  private nextBeatTime = 0; // AudioContext time of the next beat
  private beatIndex = 0;
  private _metronomeOn = false;

  /** Callback fired on each beat — used by UI for beat indicators. */
  onBeat: ((beatIndex: number, isDownbeat: boolean) => void) | null = null;

  constructor(ctx: AudioContext, masterNode: AudioNode) {
    this.ctx = ctx;
    this.masterNode = masterNode;
  }

  get bpm(): number {
    return this._bpm;
  }

  /** Clamp BPM to sane range (30–300) to prevent broken timing. */
  set bpm(v: number) {
    this._bpm = Math.max(30, Math.min(300, v));
  }

  get metronomeOn(): boolean {
    return this._metronomeOn;
  }

  set metronomeOn(on: boolean) {
    this._metronomeOn = on;
  }

  /** Duration of one beat in seconds. */
  get beatDuration(): number {
    return 60 / this._bpm;
  }

  /** Duration of one bar in seconds. */
  get barDuration(): number {
    return this.beatDuration * this.beatsPerBar;
  }

  /** Duration of one bar in samples — used for quantized recording lengths. */
  get barLengthSamples(): number {
    return Math.round(this.barDuration * this.ctx.sampleRate);
  }

  /** Start the look-ahead scheduler. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextBeatTime = this.ctx.currentTime;
    this.beatIndex = 0;
    this.schedule();
    this.schedulerId = window.setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
  }

  /** Stop the scheduler and metronome. */
  stop(): void {
    this.running = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  /** Get the AudioContext time of the next bar boundary (for quantized start/stop). */
  getNextBarBoundary(): number {
    if (!this.running) return this.ctx.currentTime;
    const now = this.ctx.currentTime;
    const beatsIntoBar = this.beatIndex % this.beatsPerBar;
    const beatsUntilBar = beatsIntoBar === 0 ? 0 : this.beatsPerBar - beatsIntoBar;
    return now + beatsUntilBar * this.beatDuration;
  }

  /** Get the AudioContext time of the next beat boundary. */
  getNextBeatBoundary(): number {
    if (!this.running) return this.ctx.currentTime;
    return this.nextBeatTime;
  }

  /**
   * Quantize a sample count to the nearest bar boundary.
   * Used to snap the first recording length to whole bars.
   */
  quantizeToBar(samples: number): number {
    const barSamples = this.barLengthSamples;
    if (barSamples === 0) return samples;
    const bars = Math.max(1, Math.round(samples / barSamples));
    return bars * barSamples;
  }

  /** Quantize a sample count to the nearest beat boundary. */
  quantizeToBeat(samples: number): number {
    const beatSamples = Math.round(this.beatDuration * this.ctx.sampleRate);
    if (beatSamples === 0) return samples;
    const beats = Math.max(1, Math.round(samples / beatSamples));
    return beats * beatSamples;
  }

  // ── Scheduler ──────────────────────────────────────────────────────────

  /**
   * Schedule all beats that fall within the look-ahead window.
   * Runs on a JS timer but schedules Web Audio events with sample-accurate timing.
   */
  private schedule(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD_MS / 1000;

    while (this.nextBeatTime < horizon) {
      const isDownbeat = this.beatIndex % this.beatsPerBar === 0;

      if (this._metronomeOn) {
        this.playClick(this.nextBeatTime, isDownbeat);
      }

      this.onBeat?.(this.beatIndex, isDownbeat);

      this.beatIndex++;
      this.nextBeatTime += this.beatDuration;
    }
  }

  /**
   * Play a metronome click as a short sine burst.
   * Downbeats are higher-pitched (1500Hz) and louder than off-beats (1000Hz).
   */
  private playClick(when: number, isDownbeat: boolean): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = isDownbeat ? 1500 : 1000;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(isDownbeat ? 0.4 : 0.3, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.03);

    osc.connect(gain);
    gain.connect(this.masterNode);
    osc.start(when);
    osc.stop(when + 0.04); // short burst, auto-disconnects after stop
  }

  // ── Tap tempo ──────────────────────────────────────────────────────────

  /** Timestamps of recent taps (up to 5). */
  private tapTimes: number[] = [];

  /**
   * Tap tempo — call repeatedly and it averages the intervals to derive BPM.
   * Resets if more than 2 seconds elapse between taps (assumed new tempo).
   */
  tapTempo(): void {
    const now = performance.now();
    this.tapTimes.push(now);

    // Keep only the last 5 taps for a stable average
    if (this.tapTimes.length > 5) {
      this.tapTimes.shift();
    }

    if (this.tapTimes.length < 2) return;

    // Reset if the last gap was too long — user is starting a new tempo
    if (this.tapTimes.length >= 2) {
      const lastGap = this.tapTimes[this.tapTimes.length - 1] - this.tapTimes[this.tapTimes.length - 2];
      if (lastGap > 2000) {
        this.tapTimes = [now];
        return;
      }
    }

    // Average all intervals for a stable reading
    let totalInterval = 0;
    for (let i = 1; i < this.tapTimes.length; i++) {
      totalInterval += this.tapTimes[i] - this.tapTimes[i - 1];
    }
    const avgInterval = totalInterval / (this.tapTimes.length - 1);

    this.bpm = Math.round(60000 / avgInterval);
  }
}
