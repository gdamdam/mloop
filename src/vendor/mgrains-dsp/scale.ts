/**
 * Vendored verbatim from mgrains (github.com/gdamdam/mgrains, same author,
 * AGPL-3.0-or-later) @ commit 50cc17e:
 *   - PitchScale + SCALE_MASKS + PITCH_SCALES from src/audio/contracts.ts
 *   - snapToScale from src/audio/dsp/GranularCore.ts (was module-private there;
 *     exported here)
 * Kept byte-for-byte with upstream so it stays trivially re-syncable; do not
 * edit — change it upstream and re-copy.
 */

export type PitchScale =
  | 'off'
  | 'octaves'
  | 'fifths'
  | 'major'
  | 'minor'
  | 'majorPent'
  | 'minorPent'

// Pitch classes (semitone offsets within an octave) for each scale mask. Frozen
// so the engine can read them allocation-free on the audio thread.
export const SCALE_MASKS: Readonly<Record<Exclude<PitchScale, 'off'>, readonly number[]>> =
  Object.freeze({
    octaves: [0],
    fifths: [0, 7],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    majorPent: [0, 2, 4, 7, 9],
    minorPent: [0, 3, 5, 7, 10],
  })

export const PITCH_SCALES = ['off', 'octaves', 'fifths', 'major', 'minor', 'majorPent', 'minorPent'] as const

export function snapToScale(semitones: number, mask: readonly number[]): number {
  const octave = Math.floor(semitones / 12)
  const within = semitones - octave * 12
  let best = mask[0]
  let bestDistance = Infinity
  for (let index = 0; index <= mask.length; index += 1) {
    const pitchClass = index < mask.length ? mask[index] : mask[0] + 12
    const distance = Math.abs(within - pitchClass)
    if (distance < bestDistance) {
      bestDistance = distance
      best = pitchClass
    }
  }
  return octave * 12 + best
}
