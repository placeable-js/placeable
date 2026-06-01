import {
  type ContainerBox,
  type ContainerPoint,
  containerBox,
  containerPoint,
} from '../coords/types'
import { center } from '../math/box'
import { applyToPoint, decompose, invert } from '../math/matrix'
import { EPSILON } from '../math/numeric'
import type { Box, Matrix, Vec2 } from '../math/types'
import type { GestureFrame } from './types'

/**
 * Relative tolerance for the similarity check. Comfortably above floating-point
 * noise for a genuine `translate · rotate · uniform-scale` matrix, yet tight
 * enough to reject the non-uniform scale and skew that v1 does not support.
 */
const SIMILARITY_TOLERANCE = 1e-6

/**
 * A {@link GestureFrame} backed by an affine `localFromContainer` matrix — the
 * mapping from **container** space to the target's **local** (layout) frame
 * produced by the ancestor transform stack (zoom scale, group rotation, nested
 * offsets). Use this when a target sits inside transformed ancestors; for the
 * untransformed case prefer the allocation-free {@link identityFrame}.
 *
 * **Supported transform class: similarity** (translation · rotation ·
 * *uniform* scale). Under a similarity an oriented box maps to an oriented box,
 * so every conversion stays total and exact. Non-uniform scale and skew turn a
 * box into a parallelogram and are **out of scope for v1**; the constructor
 * asserts the matrix is a similarity and throws otherwise (a documented scope
 * boundary, mirroring {@link invert} throwing on a singular matrix).
 *
 * The matrix and its inverse are decomposed once at construction; the per-call
 * conversions allocate only their result.
 */
export function matrixFrame(localFromContainer: Matrix): GestureFrame {
  assertSimilarity(localFromContainer)
  const containerFromLocal = invert(localFromContainer)
  const toLocal = decompose(localFromContainer)
  const toContainer = decompose(containerFromLocal)

  return {
    pointToLocal(point: ContainerPoint): Vec2 {
      return applyToPoint(localFromContainer, point)
    },
    pointToContainer(point: Vec2): ContainerPoint {
      const mapped = applyToPoint(containerFromLocal, point)
      return containerPoint(mapped.x, mapped.y)
    },
    boxToContainer(box: Box): ContainerBox {
      return containerBox(
        mapBox(containerFromLocal, toContainer.rotation, toContainer.scale.x, box),
      )
    },
    boxToLocal(box: ContainerBox): Box {
      return mapBox(localFromContainer, toLocal.rotation, toLocal.scale.x, box)
    },
  }
}

/**
 * Maps an oriented box through a similarity matrix: the center transforms by
 * the full matrix, the size scales uniformly, and the box rotation gains the
 * matrix's rotation. `x`/`y` are reconstructed from the mapped center so the
 * top-left convention is preserved.
 */
function mapBox(m: Matrix, rotation: number, scale: number, box: Box): Box {
  const mappedCenter = applyToPoint(m, center(box))
  const width = box.width * scale
  const height = box.height * scale
  return {
    x: mappedCenter.x - width / 2,
    y: mappedCenter.y - height / 2,
    width,
    height,
    rotation: box.rotation + rotation,
  }
}

/**
 * Throws unless `m` is an orientation-preserving similarity. Such a matrix has
 * the linear form `[[s·cosθ, -s·sinθ], [s·sinθ, s·cosθ]]`, i.e. `a == d` and
 * `b == -c`; this single relation already implies uniform scale, orthogonal
 * axes (no skew), and a positive determinant.
 */
function assertSimilarity(m: Matrix): void {
  const scale = Math.hypot(m.a, m.b)
  if (scale <= EPSILON) {
    throw new Error('matrixFrame: localFromContainer is degenerate (≈ zero scale).')
  }
  const tolerance = SIMILARITY_TOLERANCE * scale
  if (Math.abs(m.a - m.d) > tolerance || Math.abs(m.b + m.c) > tolerance) {
    throw new Error(
      'matrixFrame: localFromContainer is not a similarity transform ' +
        '(translate · rotate · uniform-scale). Non-uniform scale and skew are not supported in v1.',
    )
  }
}
