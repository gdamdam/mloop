/**
 * DestructionEngine — progressively degrades a loop buffer on each repeat.
 *
 * Simulates the organic decay of analog media (tape, vinyl) by applying
 * cumulative per-cycle effects:
 * - Bit depth reduction (lo-fi digital crunch)
 * - Noise floor rise (hiss / static)
 * - High-frequency roll-off (simulates worn tape heads)
 *
 * Degradation ramps up over 20 cycles for a gradual transformation:
 * amount=0 → pristine digital, amount=1 → cassette-from-hell after ~20 loops.
 */

export class DestructionEngine {
  /** Degradation intensity per cycle (0–1). 0 = off. */
  amount = 0;
  /** Number of cycles the buffer has been degraded — drives cumulative decay. */
  cycleCount = 0;

  /**
   * Apply one cycle of degradation to a buffer (in-place mutation).
   * Called by LoopTrack at each loop boundary when destruction is active.
   */
  degrade(buffer: Float32Array): void {
    if (this.amount <= 0) return;
    this.cycleCount++;

    // Intensity ramps up over 20 cycles so the first few loops are subtle
    const intensity = this.amount * Math.min(this.cycleCount / 20, 1);
    const len = buffer.length;

    for (let i = 0; i < len; i++) {
      let sample = buffer[i];

      // Bitcrush: reduce effective bit depth progressively.
      // At max intensity after 20 cycles, reduces to ~6 bits (heavy aliasing).
      const bits = 16 - intensity * 10;
      if (bits < 16) {
        const steps = Math.pow(2, bits);
        sample = Math.round(sample * steps) / steps;
      }

      // Noise floor: add quiet random noise that grows with each cycle,
      // simulating tape hiss or degraded analog circuits
      const noiseLevel = intensity * 0.02;
      sample += (Math.random() * 2 - 1) * noiseLevel;

      // High-frequency roll-off: simple 1-pole lowpass (y[n] = a*x[n] + (1-a)*y[n-1]).
      // Progressively dulls the sound like worn tape or a dirty playback head.
      if (i > 0) {
        const cutoff = 1 - intensity * 0.3; // 1.0 = transparent, 0.7 = very dull
        sample = buffer[i - 1] * (1 - cutoff) + sample * cutoff;
      }

      buffer[i] = Math.max(-1, Math.min(1, sample));
    }
  }

  /** Reset degradation state (e.g., after recording a new layer or clearing track). */
  reset(): void {
    this.cycleCount = 0;
  }
}
