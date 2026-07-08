/**
 * Instrument-mode note mapping (pure). Turns an incoming note (MIDI note number
 * or QWERTY key index offset onto INSTRUMENT_BASE_NOTE) into a semitone offset
 * from the root, applying scale-lock via the vendored snapToScale.
 */
import { SCALE_MASKS, snapToScale, type PitchScale } from "../../vendor/mgrains-dsp/scale"

/** Out-of-scale handling: snap to nearest degree, or mute the key. */
export type SnapMode = "snap" | "mute"

/** QWERTY key index 0 maps to this MIDI note (C4). */
export const INSTRUMENT_BASE_NOTE = 60

/** UI/engine state for chromatic instrument mode. */
export interface InstrumentSettings {
  active: boolean
  /** Which pad is played chromatically. */
  padId: number
  /** Root note (MIDI) that maps to zero semitones. */
  root: number
  scale: PitchScale
  snapMode: SnapMode
  /** true = warp (constant tempo); false = classic repitch. */
  keepTempo: boolean
}

export const DEFAULT_INSTRUMENT: InstrumentSettings = {
  active: false,
  padId: 0,
  root: INSTRUMENT_BASE_NOTE,
  scale: "off",
  snapMode: "snap",
  keepTempo: true,
}

/**
 * Semitone offset from `root` for a played `note`, or null if the key should be
 * muted (out of scale in "mute" mode).
 */
export function noteToSemitones(
  note: number,
  root: number,
  scale: PitchScale,
  snapMode: SnapMode,
): number | null {
  const raw = note - root
  if (scale === "off") return raw
  const mask = SCALE_MASKS[scale]
  const snapped = snapToScale(raw, mask)
  if (snapMode === "mute" && snapped !== raw) return null
  return snapped
}

/** QWERTY key index → note number for INSTRUMENT_BASE_NOTE-anchored playing. */
export function keyIndexToNote(keyIndex: number, octaveShift = 0): number {
  return INSTRUMENT_BASE_NOTE + keyIndex + octaveShift * 12
}
