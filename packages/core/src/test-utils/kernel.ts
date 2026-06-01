import { type ContainerBox, containerPoint, type DesignBox } from '../coords/types'
import { identityFrame } from '../gesture/frame'
import type {
  CoordinateSpaceLike,
  GestureContext,
  GestureFrame,
  GestureOperation,
  GestureState,
  ModifierKeys,
} from '../gesture/types'
import type { Box, Vec2 } from '../math/types'
import { noModifiers } from './input'

/** Kernels never touch the coordinate space; this stand-in satisfies the type without doing work. */
const unusedSpace: CoordinateSpaceLike = {
  containerToDesignBox: (box) => box as unknown as DesignBox,
}

/** Arguments for {@link runOp}. Pointers are in **container** space, exactly as the session receives them. */
export interface RunOpArgs {
  readonly start: Box
  /** Container-space pointer at begin. */
  readonly pointerStart: Vec2
  /** Container-space pointer for this frame. */
  readonly pointer: Vec2
  readonly frame?: GestureFrame
  readonly bounds?: ContainerBox
  readonly modifiers?: ModifierKeys
}

/**
 * Drives a kernel exactly as {@link GestureSession} would: maps the container
 * pointers into the local frame, builds the per-frame {@link GestureState} and
 * {@link GestureContext}, and returns the proposed local box. Lets kernel tests
 * exercise the frame (rotation/scale) without any DOM. Not shipped.
 */
export function runOp(op: GestureOperation, args: RunOpArgs): Box {
  const frame = args.frame ?? identityFrame
  const ctx: GestureContext =
    args.bounds !== undefined
      ? { space: unusedSpace, frame, bounds: args.bounds }
      : { space: unusedSpace, frame }
  const state: GestureState = {
    start: args.start,
    proposed: args.start,
    pointerStart: frame.pointToLocal(containerPoint(args.pointerStart.x, args.pointerStart.y)),
    pointer: frame.pointToLocal(containerPoint(args.pointer.x, args.pointer.y)),
    modifiers: args.modifiers ?? noModifiers,
  }
  return op.apply(state, ctx)
}
