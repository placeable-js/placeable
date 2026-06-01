import { createDrag } from '../gesture/operations/drag'
import { HANDLE_DIRECTIONS, type Handle } from '../gesture/operations/handles'
import { createResize, type ResizeOptions, type SizeBounds } from '../gesture/operations/resize'
import { createRotate, type RotateOptions } from '../gesture/operations/rotate'
import type { GestureOperation } from '../gesture/types'

/** Per-operation parameters threaded into the kernels {@link resolveOperation} builds. */
export interface ResolveOperationOptions {
  /** Resize bounds / aspect, applied to whichever resize handle is grabbed. */
  readonly resize?: {
    readonly min?: SizeBounds
    readonly max?: SizeBounds
    readonly aspect?: ResizeOptions['aspect']
  }
  /** Rotate pivot, applied to the rotate handle. */
  readonly rotate?: RotateOptions
}

/** The `data-placeable-handle` value carried by the body-drag layer. */
const BODY = 'body'
/** The `data-placeable-handle` value carried by the rotate handle. */
const ROTATE = 'rotate'

/** Frozen set of the eight resize-handle names, for O(1) membership tests with no allocation. */
const RESIZE_HANDLES: ReadonlySet<string> = new Set(Object.keys(HANDLE_DIRECTIONS))

/**
 * Maps a `data-placeable-handle` value to the gesture kernel it drives:
 * `"body"` → drag, `"n"|"ne"|…|"nw"` → resize for that handle, `"rotate"` →
 * rotate. Returns `null` for any unrecognized value so the controller can
 * ignore a `pointerdown` that did not land on a known gizmo.
 *
 * Pure aside from constructing the chosen kernel (one allocation per gesture at
 * `pointerdown`, never per frame). Only the kernels actually referenced are
 * retained, so an adapter that omits a gizmo tree-shakes the rest.
 */
export function resolveOperation(
  handle: string,
  options: ResolveOperationOptions = {},
): GestureOperation | null {
  if (handle === BODY) {
    return createDrag()
  }
  if (handle === ROTATE) {
    return createRotate(options.rotate)
  }
  if (RESIZE_HANDLES.has(handle)) {
    const resize = options.resize
    return createResize({
      handle: handle as Handle,
      ...(resize?.min !== undefined && { min: resize.min }),
      ...(resize?.max !== undefined && { max: resize.max }),
      ...(resize?.aspect !== undefined && { aspect: resize.aspect }),
    })
  }
  return null
}
