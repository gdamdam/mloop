/**
 * Vendored verbatim from mgrains (github.com/gdamdam/mgrains, same author,
 * AGPL-3.0-or-later) — src/audio/dsp/windows.ts @ commit 50cc17e.
 * Kept byte-for-byte with upstream so it stays trivially re-syncable; do not
 * edit the DSP math here — change it upstream and re-copy. Only the import
 * path below is adapted: '../contracts' -> './contracts' (vendored type stub).
 */

import type { GrainWindow } from './contracts'

const TWO_PI = Math.PI * 2

export function grainWindow(
  kind: GrainWindow,
  phase: number,
  skew = 0,
  hardness = 0,
): number {
  if (!Number.isFinite(phase) || phase <= 0 || phase >= 1) return 0

  switch (kind) {
    case 'hard':
      return 1
    case 'percussive':
      return percussiveWindow(phase)
    case 'reverse':
      return percussiveWindow(1 - phase)
    case 'morph':
      return skewedTukeyWindow(phase, skew, hardness)
    case 'hann':
    default:
      return 0.5 - 0.5 * Math.cos(TWO_PI * phase)
  }
}

function percussiveWindow(phase: number): number {
  const attack = Math.min(1, phase / 0.035)
  return attack * Math.exp(-4.5 * phase)
}

/**
 * Continuous grain envelope. `hardness` 0..1 shrinks the raised-cosine tapers
 * toward a flat top (0 = full Hann, 1 = rectangular); `skew` -1..1 shifts the
 * taper weight between attack and decay (0 = symmetric, +1 = instant attack /
 * long decay like a pluck, -1 = the reverse). One dial spans Hann → percussive
 * → hard as a smooth surface instead of four discrete shapes.
 */
function skewedTukeyWindow(phase: number, skew: number, hardness: number): number {
  const s = Math.min(1, Math.max(-1, skew))
  const taper = 1 - Math.min(1, Math.max(0, hardness))
  const attackWidth = (taper * (1 - s)) / 2
  const decayWidth = (taper * (1 + s)) / 2
  if (attackWidth > 0 && phase < attackWidth) {
    return 0.5 - 0.5 * Math.cos((Math.PI * phase) / attackWidth)
  }
  if (decayWidth > 0 && phase > 1 - decayWidth) {
    return 0.5 - 0.5 * Math.cos((Math.PI * (1 - phase)) / decayWidth)
  }
  return 1
}
