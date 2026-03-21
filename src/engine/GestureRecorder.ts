/**
 * GestureRecorder — records and plays back XY pad movements as
 * automation loops. Gestures repeat in sync with audio loops,
 * creating evolving filter sweeps and effect modulation.
 *
 * Each gesture is a sequence of {t, x, y} points where t is
 * relative time (0–1) within one loop cycle.
 */

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

  /** Add a point during recording (called on XY pad move). */
  addPoint(x: number, y: number): void {
    if (!this.recording) return;
    const elapsed = performance.now() - this.startTime;
    const t = Math.min(1, elapsed / this.loopDurationMs);
    this.points.push({ t, x, y });
  }

  /** Stop recording. */
  stopRecording(): void {
    this.recording = false;
  }

  /** Start looping playback of recorded gesture. */
  startPlayback(loopDurationMs: number): void {
    if (this.points.length < 2) return;
    this.loopDurationMs = loopDurationMs;
    this.playing = true;
    this.startTime = performance.now();

    const tick = () => {
      if (!this.playing) return;
      const elapsed = performance.now() - this.startTime;
      const t = (elapsed % this.loopDurationMs) / this.loopDurationMs;

      // Interpolate between nearest points
      const { x, y } = this.interpolate(t);
      this.onPlayback?.(x, y);

      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Stop playback. */
  stopPlayback(): void {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  /** Clear recorded gesture. */
  clear(): void {
    this.stopPlayback();
    this.stopRecording();
    this.points = [];
  }

  /**
   * Interpolate gesture position at a given normalized time (0–1).
   * Uses linear interpolation between the two nearest recorded points.
   */
  private interpolate(t: number): { x: number; y: number } {
    const pts = this.points;
    if (pts.length === 0) return { x: 0.5, y: 0.5 };
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y };

    // Find surrounding points
    let before = pts[0];
    let after = pts[pts.length - 1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].t <= t && pts[i + 1].t >= t) {
        before = pts[i];
        after = pts[i + 1];
        break;
      }
    }

    // Linear interpolation
    const range = after.t - before.t;
    if (range <= 0) return { x: before.x, y: before.y };
    const frac = (t - before.t) / range;
    return {
      x: before.x + (after.x - before.x) * frac,
      y: before.y + (after.y - before.y) * frac,
    };
  }
}
