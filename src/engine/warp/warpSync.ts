/**
 * Pure warp stretch-ratio math (no audio deps) so PadEngine's tempo-sync
 * decision is unit-testable.
 */

export interface WarpSyncInput {
  /** Stretch the clip to match session tempo (needs nativeBeats > 0). */
  syncToTempo: boolean
  /** The clip's musical length in beats (0 = unknown → no sync). */
  nativeBeats: number
  /** Current session tempo. */
  bpm: number
  /** Actual (trimmed) clip length in seconds. */
  clipDurationSec: number
  /** Manual stretch when not tempo-synced. Default 1 (no stretch). */
  manualStretch?: number
}

/** Clamp to a musically sane range so a bad nativeBeats can't produce
 *  extreme/silent output. */
const MIN_RATIO = 0.125
const MAX_RATIO = 8

/**
 * Output-length / input-length ratio for WarpCore.
 * Tempo-sync: stretch the clip so `nativeBeats` beats last exactly as long as
 * they should at `bpm` — `(nativeBeats * 60 / bpm) / clipDurationSec`.
 */
export function computeWarpStretchRatio(input: WarpSyncInput): number {
  const { syncToTempo, nativeBeats, bpm, clipDurationSec } = input
  if (syncToTempo && nativeBeats > 0 && bpm > 0 && clipDurationSec > 0) {
    const targetSec = (nativeBeats * 60) / bpm
    return clamp(targetSec / clipDurationSec, MIN_RATIO, MAX_RATIO)
  }
  const manual = input.manualStretch ?? 1
  return clamp(manual > 0 ? manual : 1, MIN_RATIO, MAX_RATIO)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
