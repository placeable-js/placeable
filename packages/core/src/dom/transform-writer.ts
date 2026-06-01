import type { TransformWriter } from '../gesture/types'
import type { Box } from '../math/types'

const RAD_TO_DEG = 180 / Math.PI

/** The inline style properties this writer owns during a gesture. */
interface StyleSnapshot {
  transform: string
  transformOrigin: string
  width: string
  height: string
  willChange: string
}

/**
 * Writes a target-local {@link Box} to an element's CSS `transform` and size,
 * mutating that element only. Compositor-friendly: position and rotation go
 * through `transform` (never `left`/`top`), size only when it changes.
 *
 * The element is assumed to be laid out at its offset-parent origin so that
 * `transform` alone places it; rotation pivots around `transform-origin:
 * 50% 50%`, matching the {@link Box} center-rotation convention.
 *
 * Reusable across gestures: `begin` snapshots the element's inline style and
 * promotes it for the duration; `restore` reverts to that snapshot (cancel);
 * `release` drops the promotion but keeps the applied box (commit). Performs no
 * layout reads.
 */
export class DomTransformWriter implements TransformWriter {
  readonly #element: HTMLElement
  #snapshot: StyleSnapshot | null = null
  #lastWidth: number | null = null
  #lastHeight: number | null = null

  constructor(element: HTMLElement) {
    this.#element = element
  }

  begin(): void {
    const style = this.#element.style
    this.#snapshot = {
      transform: style.transform,
      transformOrigin: style.transformOrigin,
      width: style.width,
      height: style.height,
      willChange: style.willChange,
    }
    this.#lastWidth = null
    this.#lastHeight = null
    style.willChange = 'transform'
    style.transformOrigin = '50% 50%'
  }

  applyBox(box: Box): void {
    const style = this.#element.style
    const degrees = box.rotation * RAD_TO_DEG
    style.transform = `translate(${box.x}px, ${box.y}px) rotate(${degrees}deg)`
    if (box.width !== this.#lastWidth) {
      style.width = `${box.width}px`
      this.#lastWidth = box.width
    }
    if (box.height !== this.#lastHeight) {
      style.height = `${box.height}px`
      this.#lastHeight = box.height
    }
  }

  restore(): void {
    if (this.#snapshot === null) {
      return
    }
    const style = this.#element.style
    style.transform = this.#snapshot.transform
    style.transformOrigin = this.#snapshot.transformOrigin
    style.width = this.#snapshot.width
    style.height = this.#snapshot.height
    style.willChange = this.#snapshot.willChange
    this.#snapshot = null
  }

  release(): void {
    if (this.#snapshot === null) {
      return
    }
    this.#element.style.willChange = this.#snapshot.willChange
    this.#snapshot = null
  }
}
