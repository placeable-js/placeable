import { describe, expect, it } from 'vitest'
import { aabb, center, corners, equals, fromRect } from './box'
import { approxEqual } from './numeric'
import type { Box } from './types'

const SQRT2 = Math.SQRT2

describe('box', () => {
  it('computes the center', () => {
    expect(center({ x: 0, y: 0, width: 10, height: 20, rotation: 0 })).toEqual({ x: 5, y: 10 })
  })

  it('returns axis-aligned corners for an unrotated box', () => {
    const [tl, tr, br, bl] = corners({ x: 0, y: 0, width: 10, height: 4, rotation: 0 })
    expect(tl).toEqual({ x: 0, y: 0 })
    expect(tr).toEqual({ x: 10, y: 0 })
    expect(br).toEqual({ x: 10, y: 4 })
    expect(bl).toEqual({ x: 0, y: 4 })
  })

  it('rotates corners around the center', () => {
    // 90° rotation of a 2x4 box centered at (1, 2).
    const [tl] = corners({ x: 0, y: 0, width: 2, height: 4, rotation: Math.PI / 2 })
    expect(approxEqual(tl.x, 3)).toBe(true)
    expect(approxEqual(tl.y, 1)).toBe(true)
  })

  it('computes the AABB of a rotated square', () => {
    const rotated = aabb({ x: 0, y: 0, width: 10, height: 10, rotation: Math.PI / 4 })
    expect(approxEqual(rotated.width, 10 * SQRT2)).toBe(true)
    expect(approxEqual(rotated.height, 10 * SQRT2)).toBe(true)
    expect(rotated.rotation).toBe(0)
  })

  it('builds a box from a rect and compares boxes', () => {
    const box: Box = fromRect({ x: 1, y: 2, width: 3, height: 4 })
    expect(box).toEqual({ x: 1, y: 2, width: 3, height: 4, rotation: 0 })
    expect(equals(box, fromRect({ x: 1, y: 2, width: 3, height: 4 }))).toBe(true)
    expect(equals(box, fromRect({ x: 1, y: 2, width: 3, height: 5 }))).toBe(false)
  })
})
