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

    // Intensity ramps up over 5 cycles for fast audible change
    const intensity = this.amount * Math.min(this.cycleCount / 5, 1);
    const len = buffer.length;

    // Pass 1: Bitcrush — aggressive sample degradation
    const bits = 16 - intensity * 14; // down to ~2 bits at full intensity
    if (bits < 14) {
      const steps = Math.pow(2, Math.max(2, bits));
      for (let i = 0; i < len; i++) {
        buffer[i] = Math.round(buffer[i] * steps) / steps;
      }
    }

    // Pass 2: Lowpass — heavy muffling, apply twice for stronger effect
    const cutoff = Math.max(0.08, 1 - intensity * 0.9);
    for (let pass = 0; pass < 2; pass++) {
      let prev = buffer[0];
      for (let i = 1; i < len; i++) {
        buffer[i] = prev * (1 - cutoff) + buffer[i] * cutoff;
        prev = buffer[i];
      }
    }

    // Pass 3: Wow/flutter — pitch wobble
    if (intensity > 0.1) {
      const wobbleDepth = Math.floor(intensity * 5);
      for (let i = wobbleDepth; i < len - wobbleDepth; i++) {
        const offset = Math.floor(Math.sin(i * 0.001) * wobbleDepth);
        buffer[i] = buffer[i + offset] * 0.6 + buffer[i] * 0.4;
      }
    }

    // Pass 4: Sample dropout — random samples zeroed out
    if (intensity > 0.3) {
      const dropRate = intensity * 0.02;
      for (let i = 0; i < len; i++) {
        if (Math.random() < dropRate) buffer[i] = 0;
      }
    }

    // Pass 5: Noise floor — tape hiss
    const noiseLevel = intensity * 0.02;
    for (let i = 0; i < len; i++) {
      buffer[i] += (Math.random() * 2 - 1) * noiseLevel;
      buffer[i] = Math.max(-1, Math.min(1, buffer[i]));
    }

    // Pass 6: Volume reduction (signal loss)
    const volumeLoss = 1 - intensity * 0.08;
    for (let i = 0; i < len; i++) {
      buffer[i] *= volumeLoss;
    }
  }

  /** Reset degradation state (e.g., after recording a new layer or clearing track). */
  reset(): void {
    this.cycleCount = 0;
  }
}
