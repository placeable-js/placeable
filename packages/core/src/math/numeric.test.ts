import { describe, expect, it } from 'vitest'
import { approxEqual, clamp, EPSILON, roundTo } from './numeric'

describe('approxEqual', () => {
  it('treats values within epsilon as equal', () => {
    expect(approxEqual(1, 1 + EPSILON / 2)).toBe(true)
    expect(approxEqual(1, 1.1)).toBe(false)
  })

  it('honors a custom epsilon', () => {
    expect(approxEqual(1, 1.05, 0.1)).toBe(true)
  })
})

describe('clamp', () => {
  it('bounds the value', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('throws when min exceeds max', () => {
    expect(() => clamp(0, 10, 0)).toThrow(RangeError)
  })
})

describe('roundTo', () => {
  it('snaps to the nearest multiple of step', () => {
    expect(roundTo(7, 5)).toBe(5)
    expect(roundTo(8, 5)).toBe(10)
  })

  it('returns the value unchanged for a non-positive step', () => {
    expect(roundTo(7.3, 0)).toBe(7.3)
    expect(roundTo(7.3, -1)).toBe(7.3)
  })
})
