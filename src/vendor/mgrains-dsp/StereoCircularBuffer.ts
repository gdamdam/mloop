/**
 * Vendored verbatim from mgrains (github.com/gdamdam/mgrains, same author,
 * AGPL-3.0-or-later) — src/audio/dsp/StereoCircularBuffer.ts @ commit 50cc17e.
 * Kept byte-for-byte with upstream so it stays trivially re-syncable; do not
 * edit the DSP math here — change it upstream and re-copy.
 */

export class StereoCircularBuffer {
  readonly capacity: number
  readonly left: Float32Array
  readonly right: Float32Array

  private writePosition = 0
  private framesWritten = 0
  private frozenState = false

  constructor(capacity: number) {
    if (!Number.isFinite(capacity) || capacity < 2) {
      throw new RangeError('Circular buffer capacity must be at least two frames')
    }
    this.capacity = Math.floor(capacity)
    this.left = new Float32Array(this.capacity)
    this.right = new Float32Array(this.capacity)
  }

  get validLength(): number {
    return Math.min(this.framesWritten, this.capacity)
  }

  get chronologicalOffset(): number {
    return this.framesWritten >= this.capacity ? this.writePosition : 0
  }

  get frozen(): boolean {
    return this.frozenState
  }

  setFrozen(frozen: boolean): void {
    this.frozenState = frozen
  }

  write(
    inputLeft: Float32Array<ArrayBufferLike>,
    inputRight?: Float32Array<ArrayBufferLike>,
  ): number {
    if (this.frozenState) return 0
    const length = inputRight
      ? Math.min(inputLeft.length, inputRight.length)
      : inputLeft.length

    for (let index = 0; index < length; index += 1) {
      const left = finiteSample(inputLeft[index])
      const right = finiteSample(inputRight?.[index] ?? left)
      this.left[this.writePosition] = left
      this.right[this.writePosition] = right
      this.writePosition = (this.writePosition + 1) % this.capacity
      this.framesWritten += 1
    }

    return length
  }

  clear(): void {
    this.left.fill(0)
    this.right.fill(0)
    this.writePosition = 0
    this.framesWritten = 0
    this.frozenState = false
  }
}

function finiteSample(value: number): number {
  return Number.isFinite(value) ? value : 0
}
