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

    // Intensity ramps up over 15 cycles
    const intensity = this.amount * Math.min(this.cycleCount / 15, 1);
    const len = buffer.length;

    // Pass 1: Bitcrush — heavy sample degradation (most audible)
    const bits = 16 - intensity * 13; // down to ~3 bits at full intensity
    if (bits < 14) {
      const steps = Math.pow(2, Math.max(2, bits));
      for (let i = 0; i < len; i++) {
        buffer[i] = Math.round(buffer[i] * steps) / steps;
      }
    }

    // Pass 2: Lowpass — dull the highs aggressively
    const cutoff = Math.max(0.15, 1 - intensity * 0.8); // 1.0→0.15 = very dull
    let prev = buffer[0];
    for (let i = 1; i < len; i++) {
      buffer[i] = prev * (1 - cutoff) + buffer[i] * cutoff;
      prev = buffer[i];
    }

    // Pass 3: Wow/flutter — subtle pitch wobble via sample skipping
    if (intensity > 0.2) {
      const wobbleDepth = Math.floor(intensity * 3);
      for (let i = wobbleDepth; i < len - wobbleDepth; i++) {
        const offset = Math.floor(Math.sin(i * 0.001) * wobbleDepth);
        buffer[i] = buffer[i + offset] * 0.7 + buffer[i] * 0.3;
      }
    }

    // Pass 4: Noise floor — tape hiss (slow ramp)
    const noiseLevel = intensity * 0.015; // gentler noise buildup
    for (let i = 0; i < len; i++) {
      buffer[i] += (Math.random() * 2 - 1) * noiseLevel;
      buffer[i] = Math.max(-1, Math.min(1, buffer[i]));
    }

    // Pass 5: Volume reduction per cycle (signal loss)
    const volumeLoss = 1 - intensity * 0.05;
    for (let i = 0; i < len; i++) {
      buffer[i] *= volumeLoss;
    }
  }

  /** Reset degradation state (e.g., after recording a new layer or clearing track). */
  reset(): void {
    this.cycleCount = 0;
  }
}
