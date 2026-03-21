/**
 * Auto-chop — detect transients in an audio buffer and return slice points.
 *
 * Uses energy-based onset detection: computes short-term energy in windows,
 * finds peaks that exceed a threshold relative to local average, and snaps
 * to zero-crossings for click-free slices.
 */

/**
 * Detect transient onset positions in a buffer.
 * @param buffer Audio samples (mono Float32Array)
 * @param maxSlices Maximum number of slices to return
 * @param sensitivity 0–1 (0 = fewer slices, 1 = more aggressive detection)
 * @returns Array of sample indices where transients start
 */
export function detectTransients(
  buffer: Float32Array,
  maxSlices = 16,
  sensitivity = 0.5,
): number[] {
  const windowSize = 512;
  const hopSize = 256;
  const numWindows = Math.floor((buffer.length - windowSize) / hopSize);
  if (numWindows < 2) return [0];

  // Compute energy per window
  const energy = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    let sum = 0;
    const start = w * hopSize;
    for (let i = 0; i < windowSize; i++) {
      const s = buffer[start + i];
      sum += s * s;
    }
    energy[w] = sum / windowSize;
  }

  // Compute onset strength: difference in energy between consecutive windows
  const onset = new Float32Array(numWindows);
  for (let w = 1; w < numWindows; w++) {
    onset[w] = Math.max(0, energy[w] - energy[w - 1]);
  }

  // Find peaks above threshold
  const maxOnset = Math.max(...Array.from(onset));
  if (maxOnset === 0) return [0];

  // Threshold scales with sensitivity: low sensitivity = high threshold
  const threshold = maxOnset * (1 - sensitivity * 0.8);
  const minGapWindows = Math.floor(buffer.length / (maxSlices * hopSize)); // minimum gap between onsets

  const peaks: number[] = [0]; // always include start
  let lastPeak = 0;

  for (let w = 1; w < numWindows - 1; w++) {
    if (onset[w] > threshold &&
        onset[w] > onset[w - 1] &&
        onset[w] >= onset[w + 1] &&
        w - lastPeak >= minGapWindows) {
      // Snap to nearest zero-crossing for click-free slices
      const samplePos = w * hopSize;
      const snapped = snapToZeroCrossing(buffer, samplePos);
      peaks.push(snapped);
      lastPeak = w;
      if (peaks.length >= maxSlices) break;
    }
  }

  return peaks;
}

/** Find the nearest zero-crossing to the given sample position. */
function snapToZeroCrossing(buffer: Float32Array, pos: number): number {
  const searchRange = 128; // search ±128 samples
  let bestPos = pos;
  let bestDist = searchRange + 1;

  for (let i = Math.max(1, pos - searchRange); i < Math.min(buffer.length - 1, pos + searchRange); i++) {
    // Zero-crossing: sign change between consecutive samples
    if ((buffer[i - 1] >= 0 && buffer[i] < 0) || (buffer[i - 1] < 0 && buffer[i] >= 0)) {
      const dist = Math.abs(i - pos);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = i;
      }
    }
  }

  return bestPos;
}

/**
 * Chop a buffer at the given slice points.
 * Returns an array of sub-buffers, one per slice.
 */
export function chopAtPoints(buffer: Float32Array, points: number[]): Float32Array[] {
  const slices: Float32Array[] = [];
  const sorted = [...points].sort((a, b) => a - b);

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    const end = i < sorted.length - 1 ? sorted[i + 1] : buffer.length;
    slices.push(buffer.slice(start, end));
  }

  return slices;
}
