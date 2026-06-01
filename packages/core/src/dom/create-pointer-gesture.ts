import type { RoundingPolicy } from '../coords/rounding'
import type { CoordinateSpace } from '../coords/space'
import type { ContainerBox } from '../coords/types'
import { GestureSession } from '../gesture/session'
import type {
  FrameScheduler,
  GestureCallbacks,
  GestureFrame,
  GestureOperation,
  Modifier,
} from '../gesture/types'
import type { Box } from '../math/types'
import { computeFrame } from './compute-frame'
import { PointerSource } from './pointer-source'
import { readBoxFromElement } from './read-box'
import { DomTransformWriter } from './transform-writer'

/** Configuration for {@link createPointerGesture}. */
export interface PointerGestureOptions {
  /** The gesture kernel (drag/resize/rotate). */
  readonly operation: GestureOperation
  /** Client ↔ container ↔ design conversion, measured by the host. */
  readonly space: CoordinateSpace
  /**
   * The scroll/viewport element that defines container space. When set, the
   * gesture frame is computed from the live ancestor transform stack at each
   * `begin` (via {@link computeFrame}), making resize/rotate correct inside
   * scaled/rotated ancestors. Takes precedence over {@link frame}.
   */
  readonly container?: Element
  /**
   * A fixed container ↔ target-local mapping, used when {@link container} is not
   * given. Defaults to the identity frame (target laid out directly in container
   * space).
   */
  readonly frame?: GestureFrame
  /** Modifier chain, applied in order after the kernel. */
  readonly modifiers?: readonly Modifier[]
  /** Containment region in container space. */
  readonly bounds?: ContainerBox
  /** Commit-time rounding policy. */
  readonly rounding?: RoundingPolicy
  /** Frame coalescer. Defaults to `requestAnimationFrame`. */
  readonly scheduler?: FrameScheduler
  /** Lifecycle callbacks. */
  readonly callbacks?: GestureCallbacks
}

/** A live pointer gesture binding; call `destroy` to detach. */
export interface PointerGestureHandle {
  destroy(): void
}

/**
 * Wires a `PointerSource`, a reusable `GestureSession`, and a
 * `DomTransformWriter` so an element becomes transformable in one call. The
 * start box is measured from the element at each `begin`. This is the vanilla
 * counterpart to the React adapter (Phase 3); it holds no branching logic of
 * its own.
 */
export function createPointerGesture(
  element: HTMLElement,
  options: PointerGestureOptions,
): PointerGestureHandle {
  const session = new GestureSession({
    operation: options.operation,
    writer: new DomTransformWriter(element),
    space: options.space,
    ...(options.modifiers !== undefined && { modifiers: options.modifiers }),
    ...(options.bounds !== undefined && { bounds: options.bounds }),
    ...(options.rounding !== undefined && { rounding: options.rounding }),
    ...(options.scheduler !== undefined && { scheduler: options.scheduler }),
    ...(options.callbacks !== undefined && { callbacks: options.callbacks }),
  })

  const frameAtBegin = (box: Box): GestureFrame | undefined => {
    if (options.container !== undefined) {
      return computeFrame(element, options.container, box).frame
    }
    return options.frame
  }

  const source = new PointerSource(element, options.space, (input) => {
    switch (input.type) {
      case 'begin': {
        const box = readBoxFromElement(element)
        session.begin(box, input.pointer, input.modifiers, frameAtBegin(box))
        break
      }
      case 'move':
        session.update(input.pointer, input.modifiers)
        break
      case 'end':
        session.end(input.pointer, input.modifiers)
        break
      case 'cancel':
        session.cancel()
        break
    }
  })

  return {
    destroy(): void {
      source.destroy()
      session.destroy()
    },
  }
}
