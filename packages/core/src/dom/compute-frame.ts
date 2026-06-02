import { matrixFrame } from '../gesture/matrix-frame'
import type { GestureFrame } from '../gesture/types'
import { center } from '../math/box'
import { applyToPoint, identity, invert, multiply } from '../math/matrix'
import type { Box, Matrix, Vec2 } from '../math/types'

/** A {@link GestureFrame} plus the rendering scale it decomposes to. */
export interface ComputedFrame {
  /** Container ↔ target-local mapping for the current ancestor transform stack. */
  readonly frame: GestureFrame
  /**
   * Uniform rendering scale: **container px per local px**. The single source
   * for any view-px quantity (e.g. snap thresholds) — see the Phase 2 plan's
   * coordinate contract. Equals the ancestor zoom under Model A.
   */
  readonly scale: number
}

/**
 * Builds the gesture-scoped {@link GestureFrame} for a target inside transformed
 * ancestors, **once at begin**. It recovers the `container → target-local`
 * similarity from two facts the browser hands us cheaply and exactly:
 *
 * 1. **Linear part** (rotation + uniform scale): the product of the CSS
 *    transform matrices of every ancestor strictly between the target and the
 *    `container`. Linear parts compose independently of `transform-origin`,
 *    layout offsets, borders, and scroll — so no per-node bookkeeping is needed.
 *    The target's *own* transform is excluded (we start at its parent), which is
 *    exactly right: the frame must encode only the ancestor context, since the
 *    box itself changes through the gesture.
 * 2. **Translation**: pinned by a single exact correspondence. Under any affine
 *    map a rectangle images to a parallelogram whose axis-aligned bounding box
 *    is centered on the image of the rectangle's center. So the target's
 *    rendered center is `getBoundingClientRect()`'s center — true even under
 *    rotation — and we anchor the linear part there.
 *
 * This replaces an earlier `Element.getBoxQuads` implementation: that API ships
 * in no current browser engine (Firefox has it disabled behind a flag; Chromium
 * and WebKit never implemented it), so it threw everywhere in practice. The
 * approach here is fully cross-browser and reproduces the same matrix.
 *
 * Assumes `container` is itself axis-aligned and unscaled in client space (it is
 * the scroll/viewport element), matching {@link CoordinateSpace}'s pure-offset
 * container model, and that it is an ancestor of `target`. Only the
 * **similarity** transform class is supported; a non-similarity ancestor stack
 * (non-uniform scale, skew) trips {@link matrixFrame}'s assertion.
 */
export function computeFrame(target: Element, container: Element, box: Box): ComputedFrame {
  const linear = ancestorLinear(target, container)
  return {
    frame: reanchorFrame(linear, target, container, box),
    scale: Math.hypot(linear.a, linear.b),
  }
}

/**
 * Rebuilds only the translation anchor of a {@link GestureFrame} from a live
 * `getBoundingClientRect` read while reusing a pre-measured ancestor **linear**
 * part, avoiding a full ancestor-stack walk. Useful when the linear part is
 * cached but the translation must be refreshed (e.g. after an idle layout
 * change). Used internally by {@link computeFrame}.
 */
export function reanchorFrame(
  linear: Matrix,
  target: Element,
  container: Element,
  box: Box,
): GestureFrame {
  const targetRect = target.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const renderedCenter: Vec2 = {
    x: targetRect.left + targetRect.width / 2 - containerRect.left,
    y: targetRect.top + targetRect.height / 2 - containerRect.top,
  }
  const localCenter = applyToPoint(linear, center(box))
  const containerFromLocal: Matrix = {
    a: linear.a,
    b: linear.b,
    c: linear.c,
    d: linear.d,
    e: renderedCenter.x - localCenter.x,
    f: renderedCenter.y - localCenter.y,
  }
  return matrixFrame(invert(containerFromLocal))
}

/**
 * The accumulated **linear** transform (translation dropped) of every ancestor
 * of `target` up to but excluding `container`, outermost last so that
 * `applyToPoint` composes them in render order.
 */
export function ancestorLinear(target: Element, container: Element): Matrix {
  let accumulated = identity()
  for (let node = target.parentElement; node !== null && node !== container; ) {
    const transform = getComputedStyle(node).transform
    if (transform !== '' && transform !== 'none') {
      const m = new DOMMatrix(transform)
      accumulated = multiply({ a: m.a, b: m.b, c: m.c, d: m.d, e: 0, f: 0 }, accumulated)
    }
    node = node.parentElement
  }
  return accumulated
}
