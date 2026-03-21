/**
 * GestureRecorder — records and plays back XY pad movements as
 * automation loops.
 *
 * Captures timestamped (t, x, y) points from user interaction with
 * the XY pad, then replays them in sync with the audio loop cycle.
 * This enables evolving filter sweeps and effect modulation that
 * repeat musically with the loop.
 *
 * Time is normalized to 0–1 (fraction of one loop cycle) so gestures
 * stay in sync even if loop length changes slightly.
 */

/** A single point in a recorded gesture automation. */
export interface GesturePoint {
  /** Relative time within loop cycle (0–1). */
  t: number;
  /** X value (0–1). */
  x: number;
  /** Y value (0–1). */
  y: number;
}

export class GestureRecorder {
  /** Recorded gesture points, normalized to 0–1 time. */
  points: GesturePoint[] = [];
  private recording = false;
  private playing = false;
  private startTime = 0;
  private loopDurationMs = 0;
  private rafId = 0;

  /** Callback fired during playback with interpolated {x, y} values. */
  onPlayback: ((x: number, y: number) => void) | null = null;

  get isRecording(): boolean { return this.recording; }
  get isPlaying(): boolean { return this.playing; }
  get hasGesture(): boolean { return this.points.length > 0; }

  /**
   * Start recording gesture points.
   * @param loopDurationMs Duration of one loop cycle in milliseconds.
   */
  startRecording(loopDurationMs: number): void {
    this.points = [];
    this.recording = true;
    this.startTime = performance.now();
    this.loopDurationMs = loopDurationMs;
  }

  /** Add a point during recording (called on each XY pad move event). */
  addPoint(x: number, y: number): void {
    if (!this.recording) return;
    const elapsed = performance.now() - this.startTime;
    // Normalize time to 0–1 so gesture stays in sync with any loop length
    const t = Math.min(1, elapsed / this.loopDurationMs);
    this.points.push({ t, x, y });
  }

  /** Stop recording. Points are retained for playback. */
  stopRecording(): void {
    this.recording = false;
  }

  /**
   * Start looping playback of the recorded gesture.
   * Uses requestAnimationFrame for smooth interpolation.
   * The gesture wraps around using modulo on elapsed time.
   */
  startPlayback(loopDurationMs: number): void {
    if (this.points.length < 2) return;
    this.loopDurationMs = loopDurationMs;
    this.playing = true;
    this.startTime = performance.now();

    const tick = () => {
      if (!this.playing) return;
      const elapsed = performance.now() - this.startTime;
      // Wrap around at loop boundary for infinite repetition
      const t = (elapsed % this.loopDurationMs) / this.loopDurationMs;

      const { x, y } = this.interpolate(t);
      this.onPlayback?.(x, y);

      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Stop playback and cancel the animation frame loop. */
  stopPlayback(): void {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  /** Clear the recorded gesture and stop all activity. */
  clear(): void {
    this.stopPlayback();
    this.stopRecording();
    this.points = [];
  }

  /**
   * Interpolate gesture position at a given normalized time (0–1).
   * Finds the two nearest recorded points and linearly interpolates
   * between them. Falls back to center (0.5, 0.5) if no data.
   */
  private interpolate(t: number): { x: number; y: number } {
    const pts = this.points;
    if (pts.length === 0) return { x: 0.5, y: 0.5 };
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y };

    // Binary search would be faster, but gesture arrays are small enough
    // that a linear scan is fine (typically <100 points per loop)
    let before = pts[0];
    let after = pts[pts.length - 1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].t <= t && pts[i + 1].t >= t) {
        before = pts[i];
        after = pts[i + 1];
        break;
      }
    }

    // Linear interpolation between the two surrounding points
    const range = after.t - before.t;
    if (range <= 0) return { x: before.x, y: before.y };
    const frac = (t - before.t) / range;
    return {
      x: before.x + (after.x - before.x) * frac,
      y: before.y + (after.y - before.y) * frac,
    };
  }
}
