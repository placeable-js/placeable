import type { CoordinateSpace } from '../coords/space'
import { type ContainerPoint, clientPoint } from '../coords/types'
import type { GestureInput, ModifierKeys } from '../gesture/types'

/** Receives the gesture-neutral input produced from pointer events. */
export type GestureInputSink = (input: GestureInput) => void

/**
 * Decides whether a `pointerdown` should start a gesture. Returning `false`
 * leaves the event untouched (no capture, no `begin`) — used by the delegated
 * chrome source to ignore clicks that miss a handle, and as the seam where the
 * controller resolves which gizmo was grabbed. Defaults to always-begin (the
 * single-element {@link createPointerGesture} path).
 */
export type ShouldBegin = (event: PointerEvent) => boolean

/**
 * Translates Pointer Events on an element into the gesture-neutral
 * {@link GestureInput} stream. Tracks a single active pointer with
 * `setPointerCapture`, ignores secondary pointers and non-primary buttons, and
 * maps `pointercancel` / lost capture to a `cancel`.
 *
 * The element it attaches to is the interaction surface (the target, a handle,
 * or — for the editor path — a **delegated chrome root** that hosts many
 * handles). It sets `touch-action: none` for the gesture's lifetime and
 * restores it on `destroy`.
 *
 * The coordinate space is resolved by calling `getSpace()` **at `pointerdown`**
 * and held for that gesture's `move`/`end`. This lets one long-lived source on
 * a chrome root see the refreshed (post-scroll) container origin each gesture,
 * while preserving the Phase 1 invariant that the space is captured at begin.
 */
export class PointerSource {
  readonly #element: HTMLElement
  readonly #getSpace: () => CoordinateSpace
  readonly #sink: GestureInputSink
  readonly #shouldBegin: ShouldBegin
  readonly #touchAction: string
  /** The active pointer id and the space captured for it; `null` while idle. */
  #active: { readonly pointerId: number; readonly space: CoordinateSpace } | null = null

  constructor(
    element: HTMLElement,
    getSpace: () => CoordinateSpace,
    sink: GestureInputSink,
    shouldBegin: ShouldBegin = () => true,
  ) {
    this.#element = element
    this.#getSpace = getSpace
    this.#sink = sink
    this.#shouldBegin = shouldBegin
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
    if (this.#active !== null) {
      element.releasePointerCapture(this.#active.pointerId)
      this.#active = null
    }
    element.style.touchAction = this.#touchAction
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary || this.#active !== null) {
      return
    }
    if (!this.#shouldBegin(event)) {
      return
    }
    const space = this.#getSpace()
    this.#element.setPointerCapture(event.pointerId)
    this.#active = { pointerId: event.pointerId, space }
    event.preventDefault()
    this.#sink({ type: 'begin', pointer: toContainer(space, event), modifiers: modifiersOf(event) })
  }

  #onPointerMove = (event: PointerEvent): void => {
    const active = this.#active
    if (active === null || event.pointerId !== active.pointerId) {
      return
    }
    this.#sink({
      type: 'move',
      pointer: toContainer(active.space, event),
      modifiers: modifiersOf(event),
    })
  }

  #onPointerUp = (event: PointerEvent): void => {
    const active = this.#active
    if (active === null || event.pointerId !== active.pointerId) {
      return
    }
    this.#element.releasePointerCapture(event.pointerId)
    this.#active = null
    this.#sink({
      type: 'end',
      pointer: toContainer(active.space, event),
      modifiers: modifiersOf(event),
    })
  }

  #onPointerCancel = (event: PointerEvent): void => {
    const active = this.#active
    if (active === null || event.pointerId !== active.pointerId) {
      return
    }
    this.#active = null
    this.#sink({ type: 'cancel' })
  }

  #onLostPointerCapture = (event: PointerEvent): void => {
    const active = this.#active
    if (active === null || event.pointerId !== active.pointerId) {
      return
    }
    this.#active = null
    this.#sink({ type: 'cancel' })
  }
}

function toContainer(space: CoordinateSpace, event: PointerEvent): ContainerPoint {
  return space.clientToContainer(clientPoint(event.clientX, event.clientY))
}

function modifiersOf(event: PointerEvent): ModifierKeys {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
  }
}
