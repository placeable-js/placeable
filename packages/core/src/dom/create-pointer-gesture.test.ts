import { afterEach, describe, expect, it, vi } from 'vitest'
import { exactRounding } from '../coords/rounding'
import { CoordinateSpace } from '../coords/space'
import { containerBox } from '../coords/types'
import { identityFrame } from '../gesture/frame'
import type { GestureCommit, GestureSnapshot } from '../gesture/types'
import { translate } from '../test-utils/input'
import { ManualScheduler } from '../test-utils/manual-scheduler'
import { createPointerGesture } from './create-pointer-gesture'

type MutableGlobal = Record<string, unknown>
const globalRef = globalThis as MutableGlobal

class FakeDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  constructor(init?: string) {
    if (typeof init === 'string') {
      const match = init.match(/matrix\(([^)]+)\)/)
      if (match?.[1] !== undefined) {
        const [a, b, c, d, e, f] = match[1].split(',').map(Number)
        Object.assign(this, { a, b, c, d, e, f })
      }
    }
  }
}

const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })

function fakeElement() {
  const handlers = new Map<string, (event: PointerEvent) => void>()
  const style: Record<string, string> = {
    transform: '',
    transformOrigin: '',
    width: '',
    height: '',
    willChange: '',
    touchAction: 'auto',
  }
  const element = {
    style,
    offsetWidth: 50,
    offsetHeight: 30,
    addEventListener: (type: string, handler: (event: PointerEvent) => void) =>
      handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  }
  const dispatch = (type: string, event: Partial<PointerEvent>): void => {
    handlers.get(type)?.(event as PointerEvent)
  }
  return { element: element as unknown as HTMLElement, dispatch, style }
}

function pointer(clientX: number, clientY: number): Partial<PointerEvent> {
  return {
    pointerId: 1,
    clientX,
    clientY,
    button: 0,
    isPrimary: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
  }
}

afterEach(() => {
  delete globalRef.DOMMatrix
  delete globalRef.getComputedStyle
})

describe('createPointerGesture', () => {
  it('drives a full drag through the engine and commits in design space', () => {
    globalRef.DOMMatrix = FakeDOMMatrix
    const computedStyle = vi.fn(() => ({ transform: 'none' }) as CSSStyleDeclaration)
    globalRef.getComputedStyle = computedStyle

    const dom = fakeElement()
    const scheduler = new ManualScheduler()
    const changes: GestureSnapshot[] = []
    const commits: GestureCommit[] = []
    // All optional wiring supplied (with non-altering values) to exercise the
    // full option surface of the helper.
    const handle = createPointerGesture(dom.element, {
      operation: translate,
      space,
      scheduler,
      frame: identityFrame,
      modifiers: [],
      bounds: containerBox({ x: -1000, y: -1000, width: 10000, height: 10000, rotation: 0 }),
      rounding: exactRounding,
      callbacks: {
        onChange: (snapshot) => changes.push(snapshot),
        onCommit: (commit) => commits.push(commit),
      },
    })

    dom.dispatch('pointerdown', pointer(100, 100))
    expect(dom.style.willChange).toBe('transform') // promoted for the gesture

    dom.dispatch('pointermove', pointer(130, 120))
    scheduler.flush()
    expect(dom.style.transform).toBe('translate(30px, 20px) rotate(0deg)')
    expect(changes).toHaveLength(1)

    dom.dispatch('pointerup', pointer(130, 120))
    expect(commits).toHaveLength(1)
    expect(commits[0]?.box).toEqual({ x: 30, y: 20, width: 50, height: 30, rotation: 0 })
    expect(dom.style.willChange).toBe('') // promotion released on commit

    // The start box was read exactly once (at begin) — never in the move loop.
    expect(computedStyle).toHaveBeenCalledTimes(1)

    handle.destroy()
  })

  it('computes the gesture frame from the live ancestor transform at begin', () => {
    globalRef.DOMMatrix = FakeDOMMatrix
    // The ×2 zoom group reports its transform; everything else is untransformed.
    globalRef.getComputedStyle = vi.fn(
      (el: Element) =>
        ({ transform: (el as unknown as { __transform?: string }).__transform ?? 'none' }) as
          | CSSStyleDeclaration
          | { transform: string },
    )

    const dom = fakeElement()
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    } as unknown as Element
    // A ×2 zoom group sits between the target (border box {0,0,50,30}) and the
    // container; its rendered center (25,15)×2 = (50,30) anchors the frame.
    const group = { __transform: 'matrix(2, 0, 0, 2, 0, 0)', parentElement: container }
    Object.assign(dom.element, {
      parentElement: group,
      getBoundingClientRect: () => ({ left: 50, top: 30, width: 0, height: 0 }),
    })

    const scheduler = new ManualScheduler()
    const commits: GestureCommit[] = []
    const handle = createPointerGesture(dom.element, {
      operation: translate,
      space,
      scheduler,
      container,
      callbacks: { onCommit: (commit) => commits.push(commit) },
    })

    dom.dispatch('pointerdown', pointer(100, 100))
    dom.dispatch('pointermove', pointer(140, 100))
    scheduler.flush()
    dom.dispatch('pointerup', pointer(140, 100))

    // A 40px container drag is a 20px local drag (×0.5); read back out at ×2 → width 100, x 40.
    expect(commits[0]?.box).toEqual({ x: 40, y: 0, width: 100, height: 60, rotation: 0 })
    handle.destroy()
  })

  it('reverts the element and emits no commit when the pointer is cancelled', () => {
    globalRef.DOMMatrix = FakeDOMMatrix
    globalRef.getComputedStyle = vi.fn(() => ({ transform: 'none' }) as CSSStyleDeclaration)

    const dom = fakeElement()
    const scheduler = new ManualScheduler()
    const commits: GestureCommit[] = []
    let cancelled = 0
    const handle = createPointerGesture(dom.element, {
      operation: translate,
      space,
      scheduler,
      callbacks: {
        onCommit: (commit) => commits.push(commit),
        onCancel: () => {
          cancelled += 1
        },
      },
    })

    dom.dispatch('pointerdown', pointer(100, 100))
    dom.dispatch('pointermove', pointer(130, 120))
    scheduler.flush()
    expect(dom.style.transform).toBe('translate(30px, 20px) rotate(0deg)')

    dom.dispatch('pointercancel', pointer(130, 120))
    expect(cancelled).toBe(1)
    expect(commits).toHaveLength(0)
    expect(dom.style.transform).toBe('') // restored to the pre-gesture value

    handle.destroy()
  })
})
