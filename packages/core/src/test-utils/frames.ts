import { matrixFrame } from '../gesture/matrix-frame'
import type { GestureFrame } from '../gesture/types'
import { compose, rotation, scaling, translation } from '../math/matrix'
import type { Matrix, Vec2 } from '../math/types'

/** The pieces of a similarity `localFromContainer`, in translate → rotate → scale order. */
export interface SimilarityParts {
  readonly translate?: Vec2
  readonly rotate?: number
  readonly scale?: number
}

/** Builds a similarity `localFromContainer` matrix from its parts (defaults: no translate/rotate, scale 1). */
export function similarityMatrix(parts: SimilarityParts = {}): Matrix {
  const translate = parts.translate ?? { x: 0, y: 0 }
  return compose(
    translation(translate.x, translate.y),
    rotation(parts.rotate ?? 0),
    scaling(parts.scale ?? 1),
  )
}

/** A {@link GestureFrame} for a transformed ancestor stack, for headless kernel tests. Not shipped. */
export function frameOf(parts: SimilarityParts = {}): GestureFrame {
  return matrixFrame(similarityMatrix(parts))
}
