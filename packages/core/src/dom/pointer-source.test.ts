import { describe, expect, it, vi } from 'vitest'
import { CoordinateSpace } from '../coords/space'
import type { GestureInput } from '../gesture/types'
import { PointerSource } from './pointer-source'

const space = new CoordinateSpace({ containerOrigin: { x: 50, y: 50 }, viewScale: 1 })

function fakeElement() {
  const handlers = new Map<string, (event: PointerEvent) => void>()
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()
  const removeEventListener = vi.fn((type: string) => handlers.delete(type))
  const style = { touchAction: 'auto' }
  const element = {
    style,
    addEventListener: (type: string, handler: (event: PointerEvent) => void) =>
      handlers.set(type, handler),
    removeEventListener,
    setPointerCapture,
    releasePointerCapture,
  }
  const dispatch = (type: string, event: Partial<PointerEvent>): void => {
    handlers.get(type)?.(event as PointerEvent)
  }
  return {
    element: element as unknown as HTMLElement,
    dispatch,
    style,
    setPointerCapture,
    releasePointerCapture,
    removeEventListener,
    handlerCount: () => handlers.size,
  }
}

function pointer(overrides: Partial<PointerEvent> = {}): Partial<PointerEvent> {
  return {
    pointerId: 1,
    clientX: 150,
    clientY: 150,
    button: 0,
    isPrimary: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  }
}

function track() {
  const inputs: GestureInput[] = []
  return { inputs, sink: (input: GestureInput) => inputs.push(input) }
}

describe('PointerSource', () => {
  it('begins on a primary pointerdown, capturing and converting to container space', () => {
    const dom = fakeElement()
    const { inputs, sink } = track()
    new PointerSource(dom.element, space, sink)

    expect(dom.style.touchAction).toBe('none')
    const event = pointer()
    dom.dispatch('pointerdown', event)

    expect(dom.setPointerCapture).toHaveBeenCalledWith(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(inputs).toEqual([
      {
        type: 'begin',
        pointer: { x: 100, y: 100 },
        modifiers: { shift: false, alt: false, meta: false, ctrl: false },
      },
    ])
  })

  it('ignores non-primary buttons, non-primary pointers, and a second pointer', () => {
    const dom = fakeElement()
    const { inputs, sink } = track()
    new PointerSource(dom.element, space, sink)

    dom.dispatch('pointerdown', pointer({ button: 1 }))
    dom.dispatch('pointerdown', pointer({ isPrimary: false }))
    expect(inputs).toHaveLength(0)

    dom.dispatch('pointerdown', pointer({ pointerId: 1 }))
    dom.dispatch('pointerdown', pointer({ pointerId: 2 })) // ignored: one already active
    expect(inputs).toHaveLength(1)
  })

  it('forwards moves for the active pointer and ignores others', () => {
    const dom = fakeElement()
    const { inputs, sink } = track()
    new PointerSource(dom.element, space, sink)
    dom.dispatch('pointerdown', pointer())

    dom.dispatch('pointermove', pointer({ clientX: 200, clientY: 150 }))
    dom.dispatch('pointermove', pointer({ pointerId: 9 })) // foreign pointer

    expect(inputs.filter((i) => i.type === 'move')).toEqual([
      {
        type: 'move',
        pointer: { x: 150, y: 100 },
        modifiers: { shift: false, alt: false, meta: false, ctrl: false },
      },
    ])
  })

  it('ends on pointerup, releasing capture, and forwards modifier keys', () => {
    const dom = fakeElement()
    const { inputs, sink } = track()
    new PointerSource(dom.element, space, sink)
    dom.dispatch('pointerdown', pointer())
    dom.dispatch('pointerup', pointer({ clientX: 160, clientY: 160, shiftKey: true }))

    expect(dom.releasePointerCapture).toHaveBeenCalledWith(1)
    const end = inputs.at(-1)
    expect(end).toEqual({
      type: 'end',
      pointer: { x: 110, y: 110 },
      modifiers: { shift: true, alt: false, meta: false, ctrl: false },
    })
  })

  it('ignores a pointerup for a foreign pointer', () => {
    const dom = fakeElement()
    const { inputs, sink } = track()
    new PointerSource(dom.element, space, sink)
    dom.dispatch('pointerdown', pointer())
    dom.dispatch('pointerup', pointer({ pointerId: 7 }))
    expect(inputs.some((i) => i.type === 'end')).toBe(false)
  })

  it('cancels on pointercancel and ignores a foreign cancel', () => {
    const dom = fakeElement()
    const { inputs, sink } = track()
    new PointerSource(dom.element, space, sink)
    dom.dispatch('pointerdown', pointer())
    dom.dispatch('pointercancel', pointer({ pointerId: 7 })) // foreign, ignored
    dom.dispatch('pointercancel', pointer())
    expect(inputs.at(-1)).toEqual({ type: 'cancel' })
    expect(inputs.filter((i) => i.type === 'cancel')).toHaveLength(1)
  })

  it('cancels on lost capture during a gesture but not after a normal up', () => {
    const dom = fakeElement()
    const { inputs, sink } = track()
    new PointerSource(dom.element, space, sink)

    dom.dispatch('pointerdown', pointer())
    dom.dispatch('lostpointercapture', pointer()) // mid-gesture: cancels
    expect(inputs.at(-1)).toEqual({ type: 'cancel' })

    dom.dispatch('pointerdown', pointer())
    dom.dispatch('pointerup', pointer())
    dom.dispatch('lostpointercapture', pointer()) // follows up: ignored
    expect(inputs.filter((i) => i.type === 'cancel')).toHaveLength(1)
  })

  it('removes listeners, releases an active capture, and restores touch-action on destroy', () => {
    const dom = fakeElement()
    const { sink } = track()
    const source = new PointerSource(dom.element, space, sink)
    dom.dispatch('pointerdown', pointer())

    source.destroy()
    expect(dom.removeEventListener).toHaveBeenCalledTimes(5)
    expect(dom.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(dom.style.touchAction).toBe('auto')
    expect(dom.handlerCount()).toBe(0)
  })

  it('does not release capture on destroy when no pointer is active', () => {
    const dom = fakeElement()
    const { sink } = track()
    const source = new PointerSource(dom.element, space, sink)
    source.destroy()
    expect(dom.releasePointerCapture).not.toHaveBeenCalled()
  })
})
