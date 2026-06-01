import { EPSILON } from './numeric'
import type { Matrix, Vec2 } from './types'

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** The identity transform. */
export function identity(): Matrix {
  return IDENTITY
}

/**
 * Composition `outer ∘ inner`: the result applies `inner` first, then
 * `outer`, so that `applyToPoint(result, p)` equals
 * `applyToPoint(outer, applyToPoint(inner, p))`.
 */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  }
}

/** Composes matrices left-to-right: `compose(A, B, C)` equals `A ∘ B ∘ C`. */
export function compose(...matrices: readonly Matrix[]): Matrix {
  return matrices.reduce(multiply, IDENTITY)
}

/** A pure translation. */
export function translation(tx: number, ty: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

/** A scale about the origin. `sy` defaults to `sx` for uniform scaling. */
export function scaling(sx: number, sy: number = sx): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

/** A rotation about the origin, `radians` clockwise-positive in screen axes. */
export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

/** The determinant of the linear part (signed area scale factor). */
export function determinant(m: Matrix): number {
  return m.a * m.d - m.b * m.c
}

/** Inverts the transform. Throws when the matrix is singular. */
export function invert(m: Matrix): Matrix {
  const det = determinant(m)
  if (Math.abs(det) <= EPSILON) {
    throw new Error('Matrix is not invertible (determinant ≈ 0)')
  }
  const inv = 1 / det
  return {
    a: m.d * inv,
    b: -m.b * inv,
    c: -m.c * inv,
    d: m.a * inv,
    e: (m.c * m.f - m.d * m.e) * inv,
    f: (m.b * m.e - m.a * m.f) * inv,
  }
}

/** Applies the transform to a point. */
export function applyToPoint(m: Matrix, p: Vec2): Vec2 {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  }
}

/** The result of decomposing an affine matrix. */
export interface MatrixDecomposition {
  readonly translation: Vec2
  /** Rotation in radians, clockwise-positive. */
  readonly rotation: number
  readonly scale: Vec2
}

/**
 * Decomposes an affine matrix into translation, rotation (radians), and
 * scale, assuming a translate → rotate → scale construction. Any skew is
 * folded into the scale and rotation; a reflection is preserved as a
 * negative `scale.y`.
 */
export function decompose(m: Matrix): MatrixDecomposition {
  const scaleX = Math.hypot(m.a, m.b)
  const det = determinant(m)
  const scaleY = scaleX === 0 ? 0 : det / scaleX
  const angle = Math.atan2(m.b, m.a)
  return {
    translation: { x: m.e, y: m.f },
    rotation: angle,
    scale: { x: scaleX, y: scaleY },
  }
}

/** Formats the matrix as a CSS `matrix(...)` function string. */
export function toMatrixString(m: Matrix): string {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`
}
