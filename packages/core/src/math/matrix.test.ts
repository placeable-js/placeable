import { describe, expect, it } from 'vitest'
import { inRange, mulberry32 } from '../test-utils/random'
import {
  applyToPoint,
  compose,
  decompose,
  determinant,
  identity,
  invert,
  multiply,
  rotation,
  scaling,
  toMatrixString,
  translation,
} from './matrix'
import { approxEqual } from './numeric'
import type { Matrix, Vec2 } from './types'

const HALF_PI = Math.PI / 2

function matrixApproxEqual(a: Matrix, b: Matrix, eps = 1e-9): boolean {
  return (
    approxEqual(a.a, b.a, eps) &&
    approxEqual(a.b, b.b, eps) &&
    approxEqual(a.c, b.c, eps) &&
    approxEqual(a.d, b.d, eps) &&
    approxEqual(a.e, b.e, eps) &&
    approxEqual(a.f, b.f, eps)
  )
}

function pointApproxEqual(a: Vec2, b: Vec2, eps = 1e-9): boolean {
  return approxEqual(a.x, b.x, eps) && approxEqual(a.y, b.y, eps)
}

describe('matrix primitives', () => {
  it('identity leaves points unchanged', () => {
    expect(applyToPoint(identity(), { x: 3, y: -7 })).toEqual({ x: 3, y: -7 })
  })

  it('translation, scaling, and rotation apply correctly', () => {
    expect(applyToPoint(translation(5, -2), { x: 1, y: 1 })).toEqual({ x: 6, y: -1 })
    expect(applyToPoint(scaling(2, 3), { x: 1, y: 1 })).toEqual({ x: 2, y: 3 })
    // 90° clockwise (screen axes): (1, 0) -> (0, 1).
    expect(pointApproxEqual(applyToPoint(rotation(HALF_PI), { x: 1, y: 0 }), { x: 0, y: 1 })).toBe(
      true,
    )
  })

  it('compose applies the right-most matrix first', () => {
    const m = compose(translation(10, 0), scaling(2))
    // scale (1,1) -> (2,2), then translate -> (12, 2).
    expect(applyToPoint(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 })
  })

  it('determinant reflects the area scale factor', () => {
    expect(determinant(scaling(2, 3))).toBe(6)
    expect(approxEqual(determinant(rotation(0.7)), 1)).toBe(true)
  })

  it('throws when inverting a singular matrix', () => {
    expect(() => invert(scaling(0, 0))).toThrow()
  })
})

describe('matrix invert/decompose round-trips', () => {
  const rng = mulberry32(0x1234)

  it('M ∘ M⁻¹ ≈ identity for random affine matrices', () => {
    for (let i = 0; i < 100; i++) {
      const m = compose(
        translation(inRange(rng(), -500, 500), inRange(rng(), -500, 500)),
        rotation(inRange(rng(), -3, 3)),
        scaling(inRange(rng(), 0.2, 5), inRange(rng(), 0.2, 5)),
      )
      expect(matrixApproxEqual(multiply(m, invert(m)), identity())).toBe(true)
    }
  })

  it('decompose preserves a reflection as negative scale.y', () => {
    const reflected = decompose(scaling(1, -1))
    expect(approxEqual(reflected.rotation, 0)).toBe(true)
    expect(approxEqual(reflected.scale.x, 1)).toBe(true)
    expect(approxEqual(reflected.scale.y, -1)).toBe(true)
  })

  it('decompose reports zero scale for a degenerate matrix', () => {
    const degenerate = decompose(scaling(0, 5))
    expect(degenerate.scale.x).toBe(0)
    expect(degenerate.scale.y).toBe(0)
  })

  it('decompose recovers translate/rotate/scale parameters', () => {
    for (let i = 0; i < 100; i++) {
      const tx = inRange(rng(), -500, 500)
      const ty = inRange(rng(), -500, 500)
      const angle = inRange(rng(), -Math.PI + 0.05, Math.PI - 0.05)
      const sx = inRange(rng(), 0.2, 5)
      const sy = inRange(rng(), 0.2, 5)

      const decomposed = decompose(compose(translation(tx, ty), rotation(angle), scaling(sx, sy)))

      expect(approxEqual(decomposed.translation.x, tx)).toBe(true)
      expect(approxEqual(decomposed.translation.y, ty)).toBe(true)
      expect(approxEqual(decomposed.rotation, angle)).toBe(true)
      expect(approxEqual(decomposed.scale.x, sx)).toBe(true)
      expect(approxEqual(decomposed.scale.y, sy)).toBe(true)
    }
  })
})

describe('toMatrixString', () => {
  it('formats as a CSS matrix function', () => {
    expect(toMatrixString(identity())).toBe('matrix(1, 0, 0, 1, 0, 0)')
  })
})
