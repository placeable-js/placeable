import type { ContainerBox } from '../coords/types'
import { computeFrame } from './compute-frame'
import { readBoxFromElement } from './read-box'

/**
 * The chrome's idle geometry source: the target's current oriented box in
 * **container** (view px) space, ready to position a sibling overlay.
 *
 * Composes the three reads done once at gesture `begin` — `readBoxFromElement`
 * (the local box), `computeFrame` (the container ↔ local mapping for the live
 * ancestor stack), and `frame.boxToContainer` — into the same `ContainerBox`
 * shape the live `snapshot.container` carries, so the idle ↔ active handoff is
 * seamless. Reads the DOM **exactly once per call** (at `begin` and on each
 * `syncChrome`), never in a loop.
 *
 * Container space depends only on the ancestor transform stack and the
 * container origin — not on `viewScale`/`pan` (those affect the design-space
 * commit only). So the chrome stays aligned under any zoom model without this
 * function knowing the zoom.
 */
export function idleChromeBox(target: HTMLElement, container: Element): ContainerBox {
  const localBox = readBoxFromElement(target)
  const { frame } = computeFrame(target, container, localBox)
  return frame.boxToContainer(localBox)
}
