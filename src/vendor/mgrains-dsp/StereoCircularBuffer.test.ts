import { describe, expect, it } from 'vitest'
import { StereoCircularBuffer } from './StereoCircularBuffer'

function chronological(channel: Float32Array, offset: number, length: number): number[] {
  return Array.from({ length }, (_, index) => channel[(offset + index) % channel.length])
}

describe('StereoCircularBuffer', () => {
  it('grows until capacity and then exposes oldest-to-newest order', () => {
    const buffer = new StereoCircularBuffer(5)
    buffer.write(Float32Array.from([1, 2, 3]))
    expect(buffer.validLength).toBe(3)
    expect(buffer.chronologicalOffset).toBe(0)

    buffer.write(Float32Array.from([4, 5, 6]))
    expect(buffer.validLength).toBe(5)
    expect(buffer.chronologicalOffset).toBe(1)
    expect(chronological(buffer.left, buffer.chronologicalOffset, buffer.validLength))
      .toEqual([2, 3, 4, 5, 6])
  })

  it('duplicates mono input, sanitizes non-finite samples, and freezes writes', () => {
    const buffer = new StereoCircularBuffer(4)
    buffer.write(Float32Array.from([0.25, Number.NaN, -0.5]))
    expect([...buffer.left.slice(0, 3)]).toEqual([0.25, 0, -0.5])
    expect([...buffer.right.slice(0, 3)]).toEqual([0.25, 0, -0.5])

    buffer.setFrozen(true)
    expect(buffer.write(Float32Array.from([1]))).toBe(0)
    expect(buffer.validLength).toBe(3)
  })

  it('clears content and state', () => {
    const buffer = new StereoCircularBuffer(3)
    buffer.write(Float32Array.from([1, 2, 3]))
    buffer.setFrozen(true)
    buffer.clear()

    expect(buffer.validLength).toBe(0)
    expect(buffer.chronologicalOffset).toBe(0)
    expect(buffer.frozen).toBe(false)
    expect([...buffer.left]).toEqual([0, 0, 0])
  })
})
