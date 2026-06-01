/** A 2D vector or point. Plain data with no coordinate space implied. */
export interface Vec2 {
  readonly x: number
  readonly y: number
}

/**
 * A 2D affine transform stored as the six significant values of the 3x3
 * matrix, matching the CSS `matrix(a, b, c, d, e, f)` and `DOMMatrix` 2D
 * conventions:
 *
 * ```
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 * ```
 *
 * Applied to a column vector `(x, y, 1)`.
 */
export interface Matrix {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

/**
 * An oriented rectangle within a single coordinate space.
 *
 * `x`/`y` is the top-left corner of the unrotated rectangle. `rotation` is
 * in **radians**, clockwise-positive (screen axes, y pointing down), applied
 * around the rectangle's center — matching CSS `transform-origin: 50% 50%`.
 */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}
