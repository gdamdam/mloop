/**
 * VoiceAllocator — polyphony bookkeeping for instrument mode.
 *
 * Pure (no audio deps) so voice-stealing and note-off routing are unit-testable.
 * Voices are keyed by note number. When the cap is reached the OLDEST voice is
 * evicted (mirrors GranularCore's held-note stealing). Re-triggering a held
 * note evicts the previous instance first (mono per note). `onEvict` is where
 * the caller stops the underlying audio voice.
 */
export class VoiceAllocator<V> {
  private readonly cap: number
  private readonly onEvict: (voice: V, note: number) => void
  private order: { note: number; voice: V }[] = []

  constructor(cap: number, onEvict: (voice: V, note: number) => void) {
    this.cap = Math.max(1, cap)
    this.onEvict = onEvict
  }

  get size(): number {
    return this.order.length
  }

  has(note: number): boolean {
    return this.order.some((e) => e.note === note)
  }

  /** Register a voice for `note`, evicting a same-note retrigger and, if at
   *  the cap, the oldest voice. */
  add(note: number, voice: V): void {
    const existing = this.order.findIndex((e) => e.note === note)
    if (existing >= 0) {
      const [dup] = this.order.splice(existing, 1)
      this.onEvict(dup.voice, dup.note)
    }
    while (this.order.length >= this.cap) {
      const oldest = this.order.shift()!
      this.onEvict(oldest.voice, oldest.note)
    }
    this.order.push({ note, voice })
  }

  /** Remove and return the voice for `note` (note-off), or null if none. */
  remove(note: number): V | null {
    const i = this.order.findIndex((e) => e.note === note)
    if (i < 0) return null
    const [e] = this.order.splice(i, 1)
    return e.voice
  }

  /** Remove all voices and return them (caller stops each). */
  clear(): V[] {
    const voices = this.order.map((e) => e.voice)
    this.order = []
    return voices
  }
}
