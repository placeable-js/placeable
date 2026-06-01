/** Default tolerance for floating-point comparisons across the library. */
export const EPSILON = 1e-9

/** Returns true when `a` and `b` are within `epsilon` of each other. */
export function approxEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon
}

/** Clamps `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`clamp: min (${min}) must be <= max (${max})`)
  }
  return Math.min(Math.max(value, min), max)
}

/**
 * Rounds `value` to the nearest multiple of `step`, the snap-to-grid helper
 * used by the commit policy. A non-positive `step` returns `value` unchanged.
 */
export function roundTo(value: number, step: number): number {
  if (step <= 0) {
    return value
  }
  return Math.round(value / step) * step
}
