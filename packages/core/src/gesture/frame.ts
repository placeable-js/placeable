import { containerBox, containerPoint } from '../coords/types'
import type { GestureFrame } from './types'

/**
 * The trivial frame for targets laid out directly in container space (no
 * rotated or scaled ancestors): container and local coordinates coincide, so
 * every conversion is an identity re-tag with no allocation. The
 * matrix-stack-backed {@link matrixFrame} handles nested/transformed ancestors.
 */
export const identityFrame: GestureFrame = {
  pointToLocal: (point) => point,
  pointToContainer: (point) => containerPoint(point.x, point.y),
  boxToContainer: (box) => containerBox(box),
  boxToLocal: (box) => box,
}
