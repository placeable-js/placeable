import { type ContainerPoint, containerPoint } from '../../coords/types'
import { center } from '../../math/box'
import { clamp } from '../../math/numeric'
import type { Box, Vec2 } from '../../math/types'
import type { GestureContext, GestureOperation, ModifierKeys } from '../types'
import {
  fromBoxFrame,
  HANDLE_DIRECTIONS,
  type Handle,
  type HandleDirection,
  intoBoxFrame,
  isCorner,
} from './handles'

/** A per-axis size limit. Omit an axis to leave it unconstrained. */
export interface SizeBounds {
  readonly width?: number
  readonly height?: number
}

/** Aspect-lock configuration for {@link createResize}. */
export interface ResizeAspect {
  /** Width-to-height ratio to hold. Defaults to the start box's ratio. */
  readonly ratio?: number
  /** Gate the lock on the frame's modifier keys (e.g. `(m) => m.shift`). Defaults to always-on. */
  readonly trigger?: (modifiers: ModifierKeys) => boolean
}

/** Options for {@link createResize}. */
export interface ResizeOptions {
  /** Which handle the gesture drives. */
  readonly handle: Handle
  /** Minimum size (per axis). Defaults to `0`. */
  readonly min?: SizeBounds
  /** Maximum size (per axis). Defaults to `+∞`. */
  readonly max?: SizeBounds
  /**
   * Lock the proportions. `true` locks to the start ratio; a number locks to an
   * explicit width/height ratio; an object adds a `trigger`. Omit for free resize.
   */
  readonly aspect?: boolean | number | ResizeAspect
}

interface ResizeResult {
  readonly width: number
  readonly height: number
  /** New box center in the box's unrotated, center-origin axes (relative to the start center). */
  readonly offset: Vec2
}

/**
 * Resize kernel: drags one {@link Handle} while the opposite corner/edge stays
 * fixed in **local** space, correct for rotated boxes. All math runs in the
 * box's unrotated axes, so the result is exact regardless of `box.rotation` and
 * of the ancestor {@link GestureFrame} (the session has already mapped the
 * pointer into local space).
 *
 * Owns the two policies that depend on the handle:
 * - **min/max** clamp per axis (the dragged edge stops, the anchor never moves);
 * - **aspect lock** — corners track the ratio-locked diagonal; edges drive their
 *   own axis and grow the cross-axis **symmetrically about the box center line**.
 *
 * When `ctx.bounds` is set, the dragged handle's container-space point is clamped
 * to that region before sizing, so the moved edge cannot leave the canvas while
 * the anchor stays put. (Compose the standalone `bounds` modifier for *drag*
 * containment only — resize handles its own bounds here.)
 */
export function createResize(options: ResizeOptions): GestureOperation {
  const direction = HANDLE_DIRECTIONS[options.handle]
  const minWidth = options.min?.width ?? 0
  const minHeight = options.min?.height ?? 0
  const maxWidth = options.max?.width ?? Number.POSITIVE_INFINITY
  const maxHeight = options.max?.height ?? Number.POSITIVE_INFINITY

  function ratioFor(start: Box, modifiers: ModifierKeys): number | null {
    const aspect = options.aspect
    if (aspect === undefined || aspect === false) {
      return null
    }
    let ratio: number | undefined
    let trigger: ((modifiers: ModifierKeys) => boolean) | undefined
    if (aspect === true) {
      ratio = undefined
    } else if (typeof aspect === 'number') {
      ratio = aspect
    } else {
      ratio = aspect.ratio
      trigger = aspect.trigger
    }
    if (trigger !== undefined && !trigger(modifiers)) {
      return null
    }
    const resolved = ratio ?? (start.height === 0 ? undefined : start.width / start.height)
    return resolved !== undefined && resolved > 0 ? resolved : null
  }

  return {
    apply(state, ctx): Box {
      const start = state.start
      const c0 = center(start)
      const cos = Math.cos(start.rotation)
      const sin = Math.sin(start.rotation)

      const pointerLocal =
        ctx.bounds === undefined ? state.pointer : clampToBounds(state.pointer, ctx, ctx.bounds)
      const q = intoBoxFrame(pointerLocal, c0, cos, sin)

      const halfWidth = start.width / 2
      const halfHeight = start.height / 2
      const ratio = ratioFor(start, state.modifiers)

      let result: ResizeResult
      if (ratio !== null && isCorner(direction)) {
        result = cornerAspect(direction, halfWidth, halfHeight, q, ratio, {
          minWidth,
          maxWidth,
          minHeight,
          maxHeight,
        })
      } else if (ratio !== null) {
        result = edgeAspect(direction, halfWidth, halfHeight, q, ratio, {
          minWidth,
          maxWidth,
          minHeight,
          maxHeight,
        })
      } else {
        const x = resizeAxis(direction.x, halfWidth, q.x, minWidth, maxWidth)
        const y = resizeAxis(direction.y, halfHeight, q.y, minHeight, maxHeight)
        result = { width: x.size, height: y.size, offset: { x: x.center, y: y.center } }
      }

      const newCenter = fromBoxFrame(result.offset, c0, cos, sin)
      return {
        x: newCenter.x - result.width / 2,
        y: newCenter.y - result.height / 2,
        width: result.width,
        height: result.height,
        rotation: start.rotation,
      }
    },
  }
}

interface Limits {
  readonly minWidth: number
  readonly maxWidth: number
  readonly minHeight: number
  readonly maxHeight: number
}

/** One free axis: anchor the opposite edge, move the driven edge to the pointer, clamp the size. */
function resizeAxis(
  dir: -1 | 0 | 1,
  half: number,
  q: number,
  minSize: number,
  maxSize: number,
): { size: number; center: number } {
  if (dir === 0) {
    return { size: half * 2, center: 0 }
  }
  const anchor = -dir * half
  const size = clamp(dir * (q - anchor), minSize, maxSize)
  return { size, center: anchor + dir * (size / 2) }
}

/** Corner resize with aspect: the dragged corner tracks its projection onto the ratio-locked diagonal. */
function cornerAspect(
  dir: HandleDirection,
  halfWidth: number,
  halfHeight: number,
  q: Vec2,
  ratio: number,
  limits: Limits,
): ResizeResult {
  const anchorX = -dir.x * halfWidth
  const anchorY = -dir.y * halfHeight
  const norm = Math.hypot(dir.x * ratio, dir.y)
  const dx = (dir.x * ratio) / norm
  const dy = dir.y / norm
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  const projection = (q.x - anchorX) * dx + (q.y - anchorY) * dy
  const tMin = Math.max(limits.minWidth / absX, limits.minHeight / absY)
  const tMax = Math.max(Math.min(limits.maxWidth / absX, limits.maxHeight / absY), tMin)
  const t = clamp(Math.max(projection, 0), tMin, tMax)

  return {
    width: t * absX,
    height: t * absY,
    offset: { x: anchorX + (dx * t) / 2, y: anchorY + (dy * t) / 2 },
  }
}

/** Edge resize with aspect: the edge drives its axis; the cross-axis follows the ratio, centered. */
function edgeAspect(
  dir: HandleDirection,
  halfWidth: number,
  halfHeight: number,
  q: Vec2,
  ratio: number,
  limits: Limits,
): ResizeResult {
  if (dir.x !== 0) {
    const anchorX = -dir.x * halfWidth
    let width = clamp(dir.x * (q.x - anchorX), limits.minWidth, limits.maxWidth)
    let height = width / ratio
    if (height < limits.minHeight || height > limits.maxHeight) {
      height = clamp(height, limits.minHeight, limits.maxHeight)
      width = height * ratio
    }
    return { width, height, offset: { x: anchorX + dir.x * (width / 2), y: 0 } }
  }
  const anchorY = -dir.y * halfHeight
  let height = clamp(dir.y * (q.y - anchorY), limits.minHeight, limits.maxHeight)
  let width = height * ratio
  if (width < limits.minWidth || width > limits.maxWidth) {
    width = clamp(width, limits.minWidth, limits.maxWidth)
    height = width / ratio
  }
  return { width, height, offset: { x: 0, y: anchorY + dir.y * (height / 2) } }
}

/** Clamps the dragged handle's container-space point to the bounds region, then maps it back to local. */
function clampToBounds(pointer: Vec2, ctx: GestureContext, region: Box): Vec2 {
  const handle = ctx.frame.pointToContainer(pointer)
  const clamped: ContainerPoint = containerPoint(
    clamp(handle.x, region.x, region.x + region.width),
    clamp(handle.y, region.y, region.y + region.height),
  )
  return ctx.frame.pointToLocal(clamped)
}
