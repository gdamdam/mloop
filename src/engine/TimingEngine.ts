/**
 * TimingEngine — master clock with look-ahead scheduling.
 * Provides metronome clicks and quantized record boundaries.
 * Ported from mpump Sequencer.ts timing pattern.
 */

const LOOKAHEAD_MS = 100;
const SCHEDULE_INTERVAL_MS = 25;

export class TimingEngine {
  private ctx: AudioContext;
  private masterNode: AudioNode;
  private _bpm = 120;
  private beatsPerBar = 4;
  private running = false;
  private schedulerId: number | null = null;
  private nextBeatTime = 0; // in AudioContext seconds
  private beatIndex = 0;
  private _metronomeOn = false;

  // Callbacks
  onBeat: ((beatIndex: number, isDownbeat: boolean) => void) | null = null;

  constructor(ctx: AudioContext, masterNode: AudioNode) {
    this.ctx = ctx;
    this.masterNode = masterNode;
  }

  get bpm(): number {
    return this._bpm;
  }

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

  /** Duration of one bar in samples. */
  get barLengthSamples(): number {
    return Math.round(this.barDuration * this.ctx.sampleRate);
  }

  /** Start the scheduler. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextBeatTime = this.ctx.currentTime;
    this.beatIndex = 0;
    this.schedule();
    this.schedulerId = window.setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
  }

  /** Stop the scheduler. */
  stop(): void {
    this.running = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  /** Get the AudioContext time of the next bar boundary. */
  getNextBarBoundary(): number {
    if (!this.running) return this.ctx.currentTime;
    const now = this.ctx.currentTime;
    // How many beats until next bar start?
    const beatsIntoBar = this.beatIndex % this.beatsPerBar;
    const beatsUntilBar = beatsIntoBar === 0 ? 0 : this.beatsPerBar - beatsIntoBar;
    return now + beatsUntilBar * this.beatDuration;
  }

  /** Get the AudioContext time of the next beat boundary. */
  getNextBeatBoundary(): number {
    if (!this.running) return this.ctx.currentTime;
    return this.nextBeatTime;
  }

  /** Quantize a sample count to the nearest bar boundary. */
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

  private schedule(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD_MS / 1000;

    while (this.nextBeatTime < horizon) {
      const isDownbeat = this.beatIndex % this.beatsPerBar === 0;

      // Metronome click
      if (this._metronomeOn) {
        this.playClick(this.nextBeatTime, isDownbeat);
      }

      // Notify listener
      this.onBeat?.(this.beatIndex, isDownbeat);

      this.beatIndex++;
      this.nextBeatTime += this.beatDuration;
    }
  }

  /** Play a metronome click — ported from mpump AudioPort.playClick. */
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
    osc.stop(when + 0.04);
  }

  /** Tap tempo — call repeatedly and it averages the intervals. */
  private tapTimes: number[] = [];

  tapTempo(): void {
    const now = performance.now();
    this.tapTimes.push(now);

    // Keep last 5 taps
    if (this.tapTimes.length > 5) {
      this.tapTimes.shift();
    }

    // Need at least 2 taps
    if (this.tapTimes.length < 2) return;

    // Average the intervals
    let totalInterval = 0;
    for (let i = 1; i < this.tapTimes.length; i++) {
      totalInterval += this.tapTimes[i] - this.tapTimes[i - 1];
    }
    const avgInterval = totalInterval / (this.tapTimes.length - 1);

    // Reset if tap was too long ago (>2 seconds gap = restart)
    if (this.tapTimes.length >= 2) {
      const lastGap = this.tapTimes[this.tapTimes.length - 1] - this.tapTimes[this.tapTimes.length - 2];
      if (lastGap > 2000) {
        this.tapTimes = [now];
        return;
      }
    }

    this._bpm = Math.round(60000 / avgInterval);
  }
}
