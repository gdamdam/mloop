/**
 * Vendored verbatim from mgrains (github.com/gdamdam/mgrains, same author,
 * AGPL-3.0-or-later) — src/audio/dsp/grainFilter.ts @ commit 50cc17e.
 * Kept byte-for-byte with upstream so it stays trivially re-syncable; do not
 * edit the DSP math here — change it upstream and re-copy.
 */

// Per-grain resonant lowpass: Cytomic/Simper trapezoidal SVF, lowpass output.
// State lives in GranularCore's per-slot typed arrays (Float64Array per channel);
// these free functions do the math so the loop stays class-free and the DSP is
// unit-testable. The trapezoidal form is unconditionally stable for g > 0,
// k > 0, so no per-sample guards are needed — stability is proven by test.

// Fixed damping k = 1/Q. 0.75 => Q ~= 1.33 (~ +2.5 dB bump at cutoff): audible
// color without self-oscillation. Tuned by ear at release QA.
export const GRAIN_FILTER_K = 0.75

// Upper cutoff guard: 0.22 x sampleRate (same guard as mkeys' SVF fix), keeping
// tan(pi*fc/sr) far from its pole at Nyquist. Lower guard: 20 Hz so a deep
// negative spread draw can never reach g = 0.
export const GRAIN_FILTER_MAX_RATIO = 0.22
export const GRAIN_FILTER_MIN_HZ = 20

export function clampGrainCutoff(cutoffHz: number, sampleRate: number): number {
  const max = GRAIN_FILTER_MAX_RATIO * sampleRate
  if (!Number.isFinite(cutoffHz)) return max
  return Math.min(max, Math.max(GRAIN_FILTER_MIN_HZ, cutoffHz))
}

// Integrator gain for a (pre-clamped) cutoff. The only transcendental per grain
// LIFETIME — called once at spawn, never in the per-sample loop.
export function grainFilterG(cutoffHz: number, sampleRate: number): number {
  return Math.tan(Math.PI * (cutoffHz / sampleRate))
}

// One lowpass sample for `slot`, reading/writing the caller's state arrays in
// place (zero allocation). a1/a2/a3 are the Simper coefficients derived from
// g and GRAIN_FILTER_K: a1 = 1/(1 + g*(g + k)), a2 = g*a1, a3 = g*a2.
export function svfLowpass(
  input: number,
  a1: number,
  a2: number,
  a3: number,
  ic1: Float64Array,
  ic2: Float64Array,
  slot: number,
): number {
  const v3 = input - ic2[slot]
  const v1 = a1 * ic1[slot] + a2 * v3
  const v2 = ic2[slot] + a2 * ic1[slot] + a3 * v3
  ic1[slot] = 2 * v1 - ic1[slot]
  ic2[slot] = 2 * v2 - ic2[slot]
  return v2
}
