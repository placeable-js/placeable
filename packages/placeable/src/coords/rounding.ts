import { roundTo } from '../math/numeric'
import { type DesignBox, type DesignPoint, designBox, designPoint } from './types'

/**
 * Maps a raw design-space scalar to its committed value. This is the hook the
 * commit path uses to apply a rounding/snapping policy; the policy choice
 * (exact, integer px, grid step) is left to the host.
 */
export type RoundingPolicy = (value: number) => number

/** Commits exact floating-point values (no rounding). */
export const exactRounding: RoundingPolicy = (value) => value

/** Snaps to the nearest multiple of `step` design pixels (default 1). */
export function pixelRounding(step = 1): RoundingPolicy {
  return (value) => roundTo(value, step)
}

/** Applies a rounding policy to a design-space point. */
export function roundDesignPoint(point: DesignPoint, round: RoundingPolicy): DesignPoint {
  return designPoint(round(point.x), round(point.y))
}

/**
 * Applies a rounding policy to a design-space box. Position and size are
 * rounded; `rotation` (an angle, not a pixel quantity) is left untouched.
 */
export function roundDesignBox(box: DesignBox, round: RoundingPolicy): DesignBox {
  return designBox({
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(box.height),
    rotation: box.rotation,
  })
}
