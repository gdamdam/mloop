import { describe, expect, it } from 'vitest'
import { XorShift32 } from './rng'

describe('XorShift32', () => {
  it('is deterministic and bounded', () => {
    const first = new XorShift32(42)
    const second = new XorShift32(42)
    const sequence = Array.from({ length: 16 }, () => first.nextFloat())

    expect(sequence).toEqual(Array.from({ length: 16 }, () => second.nextFloat()))
    expect(sequence.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('recovers from a zero seed', () => {
    expect(new XorShift32(0).nextUint()).not.toBe(0)
  })
})
