import { approxEqual, EPSILON } from './numeric'
import type { Box, Vec2 } from './types'

/** The center point of the box. */
export function center(box: Box): Vec2 {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The four corners of a (possibly rotated) box: top-left, top-right, bottom-right, bottom-left. */
export type BoxCorners = readonly [Vec2, Vec2, Vec2, Vec2]

/** Returns the box corners in TL, TR, BR, BL order, accounting for rotation. */
export function corners(box: Box): BoxCorners {
  const c = center(box)
  const cos = Math.cos(box.rotation)
  const sin = Math.sin(box.rotation)
  const hw = box.width / 2
  const hh = box.height / 2

  const at = (px: number, py: number): Vec2 => ({
    x: c.x + px * cos - py * sin,
    y: c.y + px * sin + py * cos,
  })

  return [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)]
}

/** A minimal axis-aligned rectangle, e.g. a `DOMRect`. */
export interface RectLike {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The axis-aligned bounding box of a (possibly rotated) box, with zero rotation. */
export function aabb(box: Box): Box {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const p of corners(box)) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, rotation: 0 }
}

/** Builds an unrotated box from an axis-aligned rectangle. */
export function fromRect(rect: RectLike): Box {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, rotation: 0 }
}

/** Approximate field-wise equality within `epsilon`. */
export function equals(a: Box, b: Box, epsilon: number = EPSILON): boolean {
  return (
    approxEqual(a.x, b.x, epsilon) &&
    approxEqual(a.y, b.y, epsilon) &&
    approxEqual(a.width, b.width, epsilon) &&
    approxEqual(a.height, b.height, epsilon) &&
    approxEqual(a.rotation, b.rotation, epsilon)
  )
}
