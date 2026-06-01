import type { Box } from '../../math/types'
import type { GestureOperation } from '../types'

/**
 * Drag kernel: translates the start box by the pointer delta in the **local**
 * frame. Because the {@link GestureFrame} maps the pointer into local space
 * first, a diagonal drag inside a rotated/scaled ancestor yields the correct
 * local delta with no extra work here. Size and rotation are untouched.
 *
 * Compose the standalone `bounds` modifier for canvas containment.
 */
export function createDrag(): GestureOperation {
  return {
    apply(state): Box {
      return {
        ...state.start,
        x: state.start.x + (state.pointer.x - state.pointerStart.x),
        y: state.start.y + (state.pointer.y - state.pointerStart.y),
      }
    },
  }
}
