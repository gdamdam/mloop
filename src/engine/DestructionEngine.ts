/**
 * DestructionEngine — progressively degrades a loop buffer on each repeat.
 *
 * Applies subtle cumulative effects each cycle:
 * - Bit depth reduction (bitcrush)
 * - Noise floor rise
 * - High-frequency roll-off (simulates tape wear)
 * - Tiny pitch wobble (wow/flutter)
 *
 * Amount controls how aggressive the degradation is per cycle:
 * 0 = pristine digital, 1 = cassette-from-hell after a few repeats.
 */

export class DestructionEngine {
  /** Degradation amount per cycle (0–1). 0 = off. */
  amount = 0;
  /** Number of cycles the buffer has been degraded. */
  cycleCount = 0;

  /**
   * Apply one cycle of degradation to a buffer (in-place).
   * Call this each time the loop restarts.
   */
  degrade(buffer: Float32Array): void {
    if (this.amount <= 0) return;
    this.cycleCount++;

    const intensity = this.amount * Math.min(this.cycleCount / 20, 1); // ramps up over 20 cycles
    const len = buffer.length;

    for (let i = 0; i < len; i++) {
      let sample = buffer[i];

      // Bitcrush: reduce bit depth progressively
      // At full intensity after 20 cycles, reduces to ~6 bits
      const bits = 16 - intensity * 10;
      if (bits < 16) {
        const steps = Math.pow(2, bits);
        sample = Math.round(sample * steps) / steps;
      }

      // Noise floor: add quiet random noise that grows over time
      const noiseLevel = intensity * 0.02;
      sample += (Math.random() * 2 - 1) * noiseLevel;

      // High-frequency roll-off: simple 1-pole lowpass
      // Progressively dulls the sound like worn tape
      if (i > 0) {
        const cutoff = 1 - intensity * 0.3; // 1.0 = no filter, 0.7 = significant filtering
        sample = buffer[i - 1] * (1 - cutoff) + sample * cutoff;
      }

      // Clamp to avoid overflow
      buffer[i] = Math.max(-1, Math.min(1, sample));
    }
  }

  /** Reset degradation state (e.g., when recording new layer). */
  reset(): void {
    this.cycleCount = 0;
  }
}
