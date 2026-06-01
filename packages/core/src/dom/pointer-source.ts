import type { CoordinateSpace } from '../coords/space'
import { clientPoint } from '../coords/types'
import type { GestureInput, ModifierKeys } from '../gesture/types'

/** Receives the gesture-neutral input produced from pointer events. */
export type GestureInputSink = (input: GestureInput) => void

/**
 * Translates Pointer Events on an element into the gesture-neutral
 * {@link GestureInput} stream. Tracks a single active pointer with
 * `setPointerCapture`, ignores secondary pointers and non-primary buttons, and
 * maps `pointercancel` / lost capture to a `cancel`.
 *
 * The element it attaches to is the interaction surface (the target, a handle,
 * or a delegated root) — the source is agnostic to what is being transformed.
 * It sets `touch-action: none` for the gesture's lifetime and restores it on
 * `destroy`. Coordinates are converted to container space via the supplied
 * {@link CoordinateSpace}, captured by the caller at attach time (mid-gesture
 * scroll reconciliation is a Phase 3 concern).
 */
export class PointerSource {
  readonly #element: HTMLElement
  readonly #space: CoordinateSpace
  readonly #sink: GestureInputSink
  readonly #touchAction: string
  #activePointerId: number | null = null

  constructor(element: HTMLElement, space: CoordinateSpace, sink: GestureInputSink) {
    this.#element = element
    this.#space = space
    this.#sink = sink
    this.#touchAction = element.style.touchAction
    element.style.touchAction = 'none'
    element.addEventListener('pointerdown', this.#onPointerDown)
    element.addEventListener('pointermove', this.#onPointerMove)
    element.addEventListener('pointerup', this.#onPointerUp)
    element.addEventListener('pointercancel', this.#onPointerCancel)
    element.addEventListener('lostpointercapture', this.#onLostPointerCapture)
  }

  /** Removes every listener, releases any capture, and restores `touch-action`. */
  destroy(): void {
    const element = this.#element
    element.removeEventListener('pointerdown', this.#onPointerDown)
    element.removeEventListener('pointermove', this.#onPointerMove)
    element.removeEventListener('pointerup', this.#onPointerUp)
    element.removeEventListener('pointercancel', this.#onPointerCancel)
    element.removeEventListener('lostpointercapture', this.#onLostPointerCapture)
    if (this.#activePointerId !== null) {
      element.releasePointerCapture(this.#activePointerId)
      this.#activePointerId = null
    }
    element.style.touchAction = this.#touchAction
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary || this.#activePointerId !== null) {
      return
    }
    this.#element.setPointerCapture(event.pointerId)
    this.#activePointerId = event.pointerId
    event.preventDefault()
    this.#sink({ type: 'begin', pointer: this.#toContainer(event), modifiers: modifiersOf(event) })
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#activePointerId) {
      return
    }
    this.#sink({ type: 'move', pointer: this.#toContainer(event), modifiers: modifiersOf(event) })
  }

  #onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#activePointerId) {
      return
    }
    this.#element.releasePointerCapture(event.pointerId)
    this.#activePointerId = null
    this.#sink({ type: 'end', pointer: this.#toContainer(event), modifiers: modifiersOf(event) })
  }

  #onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.#activePointerId) {
      return
    }
    this.#activePointerId = null
    this.#sink({ type: 'cancel' })
  }

  #onLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.#activePointerId) {
      return
    }
    this.#activePointerId = null
    this.#sink({ type: 'cancel' })
  }

  #toContainer(event: PointerEvent) {
    return this.#space.clientToContainer(clientPoint(event.clientX, event.clientY))
  }
}

function modifiersOf(event: PointerEvent): ModifierKeys {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
  }
}
