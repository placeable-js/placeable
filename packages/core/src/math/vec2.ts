import { approxEqual, EPSILON } from './numeric'
import type { Vec2 } from './types'

/** Creates a vector from its components. */
export function of(x: number, y: number): Vec2 {
  return { x, y }
}

/** Component-wise sum `a + b`. */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

/** Component-wise difference `a - b`. */
export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

/** Scales a vector by a scalar factor. */
export function scale(v: Vec2, factor: number): Vec2 {
  return { x: v.x * factor, y: v.y * factor }
}

/** Dot product `a · b`. */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

/** Euclidean length of the vector. */
export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}

/** Euclidean distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Approximate component-wise equality within `epsilon`. */
export function equals(a: Vec2, b: Vec2, epsilon: number = EPSILON): boolean {
  return approxEqual(a.x, b.x, epsilon) && approxEqual(a.y, b.y, epsilon)
}
