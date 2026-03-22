/**
 * DestructionEngine — progressive tape-style degradation per loop cycle.
 *
 * Simulates analog tape decay by degrading the actual signal each pass:
 * - Cumulative treble loss (tape head gap loss — most important)
 * - Tape saturation (soft clipping, warm compression — volume neutral)
 * - Wow/flutter (slow pitch drift across the buffer)
 * - Print-through (faint ghost echo from adjacent tape layers)
 * - Subtle hiss (only at higher intensities)
 *
 * The signal itself deteriorates — it doesn't just add noise on top.
 * amount=0 → pristine, amount=1 → nth-generation cassette copy.
 */

export class DestructionEngine {
  /** Degradation intensity per cycle (0–1). 0 = off. */
  amount = 0;
  /** Number of cycles the buffer has been degraded. */
  cycleCount = 0;

  /**
   * Apply one cycle of tape-style degradation (in-place mutation).
   * Called by LoopTrack at each loop boundary.
   */
  degrade(buffer: Float32Array): void {
    if (this.amount <= 0) return;
    this.cycleCount++;

    const intensity = this.amount * Math.min(this.cycleCount / 5, 1);
    const len = buffer.length;

    // 1. Treble loss — progressive low-pass, the core of tape decay.
    const cutoff = 0.15 + (1 - intensity) * 0.75;
    const passes = 1 + Math.floor(intensity * 3);
    for (let p = 0; p < passes; p++) {
      let prev = buffer[0];
      for (let i = 1; i < len; i++) {
        buffer[i] = prev + cutoff * (buffer[i] - prev);
        prev = buffer[i];
      }
    }

    // 2. Tape saturation — soft clipping without volume change.
    //    Apply tanh to samples above a threshold, leave quiet parts alone.
    //    This compresses peaks (warmth) without amplifying anything.
    if (intensity > 0.1) {
      for (let i = 0; i < len; i++) {
        const s = buffer[i];
        // Only saturate — never make louder than input
        buffer[i] = Math.tanh(s);
      }
    }

    // 3. Wow/flutter — slow pitch drift across the buffer.
    if (intensity > 0.1) {
      const copy = new Float32Array(buffer);
      const wowFreq = 0.5 + Math.random() * 1.5;
      const wowDepth = intensity * 8;
      const wowPhase = Math.random() * Math.PI * 2;
      for (let i = 0; i < len; i++) {
        const offset = Math.sin(wowPhase + (i / len) * Math.PI * 2 * wowFreq) * wowDepth;
        const srcIdx = i + offset;
        const idx0 = Math.floor(srcIdx);
        const frac = srcIdx - idx0;
        if (idx0 >= 0 && idx0 < len - 1) {
          buffer[i] = copy[idx0] * (1 - frac) + copy[idx0 + 1] * frac;
        }
      }
    }

    // 4. Print-through — blend (not add) a delayed copy.
    if (intensity > 0.3) {
      const echoSamples = Math.floor(len * 0.03);
      const echoMix = intensity * 0.03;
      for (let i = echoSamples; i < len; i++) {
        buffer[i] = buffer[i] * (1 - echoMix) + buffer[i - echoSamples] * echoMix;
      }
    }

    // 5. Subtle tape hiss — only at higher intensities
    if (intensity > 0.4) {
      const hissLevel = (intensity - 0.4) * 0.008;
      for (let i = 0; i < len; i++) {
        buffer[i] += (Math.random() * 2 - 1) * hissLevel;
      }
    }

    // 6. Clamp — hard limit, no sample above ±1
    for (let i = 0; i < len; i++) {
      if (buffer[i] > 1) buffer[i] = 1;
      else if (buffer[i] < -1) buffer[i] = -1;
    }
  }

  /** Reset degradation state. */
  reset(): void {
    this.cycleCount = 0;
  }
}
