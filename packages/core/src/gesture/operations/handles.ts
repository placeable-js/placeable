import type { Vec2 } from '../../math/types'

/**
 * A resize handle. Compass names: the four corners (`ne`, `se`, `sw`, `nw`) and
 * the four edge midpoints (`n`, `e`, `s`, `w`). `n` is the top edge in screen
 * axes (y increasing downward), matching the {@link Box} convention.
 */
export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/**
 * A handle's drive direction in the box's own unrotated axes, one of `-1`, `0`,
 * or `1` per axis. `0` means the axis is not driven (its two edges stay put);
 * a non-zero value names the edge that moves, so its opposite edge is the
 * fixed **anchor**.
 */
export interface HandleDirection {
  readonly x: -1 | 0 | 1
  readonly y: -1 | 0 | 1
}

/** Drive direction for every handle, in the box's unrotated axes. Frozen, shared, never allocated per call. */
export const HANDLE_DIRECTIONS: Readonly<Record<Handle, HandleDirection>> = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
}

/** Whether the handle drives both axes (a corner) rather than a single edge. */
export function isCorner(direction: HandleDirection): boolean {
  return direction.x !== 0 && direction.y !== 0
}

/**
 * Rotates a local-space point into the box's unrotated axes, with the box
 * center as origin. Inverse of {@link fromBoxFrame}. `cos`/`sin` are the box
 * rotation's, passed in so callers compute them once per gesture frame.
 */
export function intoBoxFrame(point: Vec2, center: Vec2, cos: number, sin: number): Vec2 {
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
}

/** Maps a point from the box's unrotated axes back into the local frame. Inverse of {@link intoBoxFrame}. */
export function fromBoxFrame(point: Vec2, center: Vec2, cos: number, sin: number): Vec2 {
  return {
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  }
}
