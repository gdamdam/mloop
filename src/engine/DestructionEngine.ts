/**
 * DestructionEngine — progressive tape-style degradation per loop cycle.
 *
 * Simulates analog tape decay by degrading the actual signal each pass:
 * - Cumulative treble loss (tape head gap loss — most important)
 * - Tape saturation (soft clipping, warm compression)
 * - Wow/flutter (slow pitch drift across the buffer)
 * - Print-through (faint ghost echo from adjacent tape layers)
 * - Gentle volume loss per generation
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

    // Intensity ramps over 5 cycles for gradual onset
    const intensity = this.amount * Math.min(this.cycleCount / 5, 1);
    const len = buffer.length;

    // 1. Treble loss — progressive low-pass, the core of tape decay.
    //    Each pass through tape heads loses high frequencies.
    //    Multiple passes with moderate cutoff = natural cumulative roll-off.
    const cutoff = 0.15 + (1 - intensity) * 0.75; // 0.9 (subtle) → 0.15 (heavy muffling)
    const passes = 1 + Math.floor(intensity * 3); // 1–4 filter passes
    for (let p = 0; p < passes; p++) {
      let prev = buffer[0];
      for (let i = 1; i < len; i++) {
        buffer[i] = prev + cutoff * (buffer[i] - prev);
        prev = buffer[i];
      }
    }

    // 2. Tape saturation — soft clipping that compresses peaks.
    //    Uses tanh which maps [-1,1] → [-1,1] without volume change.
    if (intensity > 0.05) {
      const drive = 1 + intensity * 1.5;
      for (let i = 0; i < len; i++) {
        buffer[i] = Math.tanh(buffer[i] * drive) / Math.tanh(drive);
      }
    }

    // 3. Wow/flutter — slow pitch drift across the buffer.
    //    Real tape has mechanical speed variation from the motor/capstan.
    //    We simulate by reading from slightly shifted positions.
    if (intensity > 0.1) {
      const copy = new Float32Array(buffer);
      const wowFreq = 0.5 + Math.random() * 1.5; // Hz-range wobble
      const wowDepth = intensity * 8; // max ±8 samples drift
      const wowPhase = Math.random() * Math.PI * 2;
      for (let i = 0; i < len; i++) {
        const offset = Math.sin(wowPhase + (i / len) * Math.PI * 2 * wowFreq) * wowDepth;
        const srcIdx = i + offset;
        const idx0 = Math.floor(srcIdx);
        const frac = srcIdx - idx0;
        if (idx0 >= 0 && idx0 < len - 1) {
          // Linear interpolation for smooth pitch shift
          buffer[i] = copy[idx0] * (1 - frac) + copy[idx0 + 1] * frac;
        }
      }
    }

    // 4. Print-through — faint ghost echo from adjacent tape layers.
    //    Mix in a delayed copy rather than adding — prevents volume buildup.
    if (intensity > 0.3) {
      const echoSamples = Math.floor(len * 0.03);
      const echoMix = intensity * 0.03; // very subtle blend
      for (let i = echoSamples; i < len; i++) {
        buffer[i] = buffer[i] * (1 - echoMix) + buffer[i - echoSamples] * echoMix;
      }
    }

    // 5. Subtle tape hiss — only at higher intensities, very low level
    if (intensity > 0.4) {
      const hissLevel = (intensity - 0.4) * 0.008;
      for (let i = 0; i < len; i++) {
        buffer[i] += (Math.random() * 2 - 1) * hissLevel;
      }
    }

    // 6. Peak limiter — prevent any volume growth over cycles.
    //    Measure peak and scale down if above original level.
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0.95) {
      const scale = 0.95 / peak;
      for (let i = 0; i < len; i++) {
        buffer[i] *= scale;
      }
    }
  }

  /** Reset degradation state. */
  reset(): void {
    this.cycleCount = 0;
  }
}
