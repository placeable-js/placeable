import { center } from '../../math/box'
import type { Box, Vec2 } from '../../math/types'
import type { GestureOperation } from '../types'

/** Options for {@link createRotate}. */
export interface RotateOptions {
  /**
   * Pivot in **local** space. Defaults to the box center, matching the writer's
   * `transform-origin: 50% 50%`. A non-center pivot orbits the box center about
   * it, baking the result into `x`/`y` so the writer stays center-based.
   */
  readonly pivot?: Vec2
}

/**
 * Rotate kernel: accumulates the angle swept by the pointer about a local pivot
 * onto the start rotation. The pointer is already in local space (mapped by the
 * {@link GestureFrame}), and a similarity frame preserves angles, so the kernel
 * is frame-agnostic. The per-gesture delta is normalized to `(−π, π]` so it
 * never jumps by a full turn as the pointer crosses the ±π boundary.
 *
 * (Multi-turn accumulation beyond ±π from the start orientation, and angle
 * snapping, are deferred to v0.2 — they need gesture-scoped state the pure
 * kernel intentionally does not carry.)
 */
export function createRotate(options: RotateOptions = {}): GestureOperation {
  return {
    apply(state): Box {
      const start = state.start
      const pivot = options.pivot ?? center(start)
      const startAngle = Math.atan2(state.pointerStart.y - pivot.y, state.pointerStart.x - pivot.x)
      const nowAngle = Math.atan2(state.pointer.y - pivot.y, state.pointer.x - pivot.x)
      const delta = normalizeAngle(nowAngle - startAngle)

      const newCenter = rotateAbout(center(start), pivot, delta)
      return {
        x: newCenter.x - start.width / 2,
        y: newCenter.y - start.height / 2,
        width: start.width,
        height: start.height,
        rotation: start.rotation + delta,
      }
    },
  }
}

/** Rotates `point` about `pivot` by `angle` radians (clockwise-positive, screen axes). */
function rotateAbout(point: Vec2, pivot: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos }
}

/** Wraps an angle into `(−π, π]`, eliminating the 2π jump at the atan2 branch cut. */
function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
