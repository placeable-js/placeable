import { describe, expect, it } from 'vitest'
import * as vec from './vec2'

describe('vec2', () => {
  it('constructs and compares', () => {
    expect(vec.of(2, 3)).toEqual({ x: 2, y: 3 })
    expect(vec.equals(vec.of(1, 1), vec.of(1, 1))).toBe(true)
  })

  it('adds and subtracts', () => {
    expect(vec.add(vec.of(1, 2), vec.of(3, 4))).toEqual({ x: 4, y: 6 })
    expect(vec.subtract(vec.of(3, 4), vec.of(1, 2))).toEqual({ x: 2, y: 2 })
  })

  it('scales', () => {
    expect(vec.scale(vec.of(2, -3), 2)).toEqual({ x: 4, y: -6 })
  })

  it('computes dot, length, and distance', () => {
    expect(vec.dot(vec.of(1, 2), vec.of(3, 4))).toBe(11)
    expect(vec.length(vec.of(3, 4))).toBe(5)
    expect(vec.distance(vec.of(0, 0), vec.of(3, 4))).toBe(5)
  })
})
