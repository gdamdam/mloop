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

    // Intensity ramps up over 10 cycles for faster audible effect
    const intensity = this.amount * Math.min(this.cycleCount / 10, 1);
    const len = buffer.length;

    // Pass 1: Bitcrush — reduce bit depth (most audible degradation)
    const bits = 16 - intensity * 12; // down to ~4 bits at full intensity
    if (bits < 15) {
      const steps = Math.pow(2, Math.max(2, bits));
      for (let i = 0; i < len; i++) {
        buffer[i] = Math.round(buffer[i] * steps) / steps;
      }
    }

    // Pass 2: Lowpass — dull the highs (separate pass avoids feedback issues)
    const cutoff = Math.max(0.3, 1 - intensity * 0.6); // 1.0→0.3 = very dull
    let prev = buffer[0];
    for (let i = 1; i < len; i++) {
      buffer[i] = prev * (1 - cutoff) + buffer[i] * cutoff;
      prev = buffer[i];
    }

    // Pass 3: Noise floor — tape hiss
    const noiseLevel = intensity * 0.04;
    for (let i = 0; i < len; i++) {
      buffer[i] += (Math.random() * 2 - 1) * noiseLevel;
      buffer[i] = Math.max(-1, Math.min(1, buffer[i]));
    }

    // Pass 4: Slight volume reduction per cycle (simulates signal loss)
    const volumeLoss = 1 - intensity * 0.03;
    for (let i = 0; i < len; i++) {
      buffer[i] *= volumeLoss;
    }
  }

  /** Reset degradation state (e.g., after recording a new layer or clearing track). */
  reset(): void {
    this.cycleCount = 0;
  }
}
