import { fromDOMMatrix } from '../math/dom'
import { decompose } from '../math/matrix'
import type { Box } from '../math/types'

/**
 * Reads an element's current placement into a target-local {@link Box}: its
 * computed `transform` (decomposed into translation + rotation) and its layout
 * size (`offsetWidth`/`offsetHeight`, which exclude the transform). Intended to
 * be called once at gesture `begin`; it is the only sanctioned layout read and
 * must not run in the move loop.
 *
 * Mirrors {@link DomTransformWriter}'s output convention, so a box read here and
 * re-applied round-trips.
 */
export function readBoxFromElement(element: HTMLElement): Box {
  const transform = getComputedStyle(element).transform
  const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform)
  const { translation, rotation } = decompose(fromDOMMatrix(matrix))
  return {
    x: translation.x,
    y: translation.y,
    width: element.offsetWidth,
    height: element.offsetHeight,
    rotation,
  }
}
