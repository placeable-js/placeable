import { containerBox } from '../../coords/types'
import { aabb } from '../../math/box'
import { clamp } from '../../math/numeric'
import type { Modifier } from '../types'

/**
 * Keeps the proposed box inside `ctx.bounds` by translation only: its
 * axis-aligned bounding box (computed in container space, accounting for
 * rotation) is shifted to fit. Size is never altered — resize-vs-bounds
 * interplay belongs to the resize kernel (Phase 2). A no-op when no bounds are
 * configured or the box already fits. If the box is larger than the bounds on
 * an axis, it is pinned to that axis' minimum edge.
 */
export const bounds: Modifier = (state, ctx) => {
  if (ctx.bounds === undefined) {
    return state
  }

  const container = ctx.frame.boxToContainer(state.proposed)
  const box = aabb(container)
  const region = ctx.bounds

  const dx = offset(box.x, box.width, region.x, region.width)
  const dy = offset(box.y, box.height, region.y, region.height)
  if (dx === 0 && dy === 0) {
    return state
  }

  const shifted = containerBox({
    x: container.x + dx,
    y: container.y + dy,
    width: container.width,
    height: container.height,
    rotation: container.rotation,
  })
  return { ...state, proposed: ctx.frame.boxToLocal(shifted) }
}

/** Translation needed to move `[start, start+size]` inside `[min, min+extent]`. */
function offset(start: number, size: number, min: number, extent: number): number {
  const max = min + extent - size
  const target = max >= min ? clamp(start, min, max) : min
  return target - start
}
