import type { FrameScheduler, GestureCommit, Handle } from '@placeable-js/core'
import type { ChromeState } from '@placeable-js/core/dom'
import { act, render } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TransformChrome } from './transform-chrome'
import { useTransformController } from './use-transform-controller'

const ALL_HANDLES: readonly Handle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

function makeChrome(state: ChromeState) {
  return {
    chromeRef: () => undefined,
    overlayRef: () => undefined,
    state,
  }
}

function visibleState(overrides?: Partial<ChromeState['handleConfig']>): ChromeState {
  return {
    target: document.createElement('div'),
    visible: true,
    handleConfig: { handles: ALL_HANDLES, rotatable: true, ...overrides },
  }
}

describe('<TransformChrome /> rendering', () => {
  it('renders nothing when the selection is empty', () => {
    const { container } = render(
      <TransformChrome
        chrome={makeChrome({
          target: null,
          visible: false,
          handleConfig: { handles: ALL_HANDLES, rotatable: true },
        })}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the control box, body layer, all eight handles, and the rotate handle', () => {
    const { container } = render(<TransformChrome chrome={makeChrome(visibleState())} />)
    expect(container.querySelector('[data-placeable-chrome]')).not.toBeNull()
    expect(container.querySelector('[data-placeable-handle="body"]')).not.toBeNull()
    for (const handle of ALL_HANDLES) {
      expect(container.querySelector(`[data-placeable-handle="${handle}"]`), handle).not.toBeNull()
    }
    expect(container.querySelector('[data-placeable-handle="rotate"]')).not.toBeNull()
  })

  it('keeps the root non-interactive and the handles interactive (pointer-events discipline)', () => {
    const { container } = render(<TransformChrome chrome={makeChrome(visibleState())} />)
    const root = container.querySelector('[data-placeable-chrome]') as HTMLElement
    const se = container.querySelector('[data-placeable-handle="se"]') as HTMLElement
    const body = container.querySelector('[data-placeable-handle="body"]') as HTMLElement
    expect(root.style.pointerEvents).toBe('none')
    expect(se.style.pointerEvents).toBe('auto')
    expect(body.style.pointerEvents).toBe('auto')
  })

  it('honors the handle configuration (subset of handles, rotate hidden)', () => {
    const { container } = render(
      <TransformChrome
        chrome={makeChrome(visibleState({ handles: ['e', 'w'], rotatable: false }))}
      />,
    )
    expect(container.querySelectorAll('[data-placeable-handle]')).toHaveLength(3) // body + e + w
    expect(container.querySelector('[data-placeable-handle="e"]')).not.toBeNull()
    expect(container.querySelector('[data-placeable-handle="w"]')).not.toBeNull()
    expect(container.querySelector('[data-placeable-handle="rotate"]')).toBeNull()
    expect(container.querySelector('[data-placeable-handle="n"]')).toBeNull()
  })

  it('renders a custom handle visual while preserving the data attribute and hit area', () => {
    const { container } = render(
      <TransformChrome
        chrome={makeChrome(visibleState({ handles: ['se'], rotatable: true }))}
        renderHandle={(handle) => <span data-custom={handle}>•</span>}
      />,
    )
    const se = container.querySelector('[data-placeable-handle="se"]') as HTMLElement
    expect(se).not.toBeNull()
    expect(se.querySelector('[data-custom="se"]')).not.toBeNull()
    const rotate = container.querySelector('[data-placeable-handle="rotate"]') as HTMLElement
    expect(rotate.querySelector('[data-custom="rotate"]')).not.toBeNull()
  })

  it('renders the toolbar slot', () => {
    const { container } = render(
      <TransformChrome
        chrome={makeChrome(visibleState())}
        toolbar={<button type="button">Delete</button>}
      />,
    )
    const toolbar = container.querySelector('[data-placeable-toolbar]')
    expect(toolbar).not.toBeNull()
    expect(toolbar?.textContent).toBe('Delete')
  })
})

// --- Integration: a real controller wired through the component in jsdom. ---

class FakeDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  constructor(init?: string) {
    const match = typeof init === 'string' ? init.match(/matrix\(([^)]+)\)/) : null
    if (match?.[1] !== undefined) {
      const [a, b, c, d, e, f] = match[1].split(',').map(Number)
      Object.assign(this, { a, b, c, d, e, f })
    }
  }
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class ManualScheduler implements FrameScheduler {
  #pending: (() => void) | null = null
  schedule(cb: () => void): void {
    this.#pending = cb
  }
  cancel(): void {
    this.#pending = null
  }
  flush(): void {
    const cb = this.#pending
    this.#pending = null
    cb?.()
  }
}

const globalRef = globalThis as Record<string, unknown>
const sizedRect = (width: number, height: number): DOMRect =>
  ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 }) as DOMRect

beforeAll(() => {
  globalRef.DOMMatrix = FakeDOMMatrix
  globalRef.ResizeObserver = FakeResizeObserver
  globalRef.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number
  globalRef.cancelAnimationFrame = (id: number) => clearTimeout(id)
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.hasPointerCapture = () => false
  }
  if (typeof globalRef.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      readonly pointerId: number
      readonly isPrimary: boolean
      readonly pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
        this.isPrimary = init.isPrimary ?? true
        this.pointerType = init.pointerType ?? 'mouse'
      }
    }
    globalRef.PointerEvent = PointerEventPolyfill
  }
})

afterAll(() => {
  globalRef.DOMMatrix = undefined
  globalRef.ResizeObserver = undefined
})

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    bubbles: true,
    cancelable: true,
  })
}

interface IntegrationProps {
  scheduler: FrameScheduler
  commits: GestureCommit[]
  apiRef: { current: ReturnType<typeof useTransformController> | null }
}

function Integration({ scheduler, commits, apiRef }: IntegrationProps) {
  const [container, setContainer] = useState<Element | null>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const api = useTransformController({
    container,
    scheduler,
    callbacks: { onCommit: (commit) => commits.push(commit) },
  })
  apiRef.current = api
  return (
    <div ref={setContainer} style={{ position: 'relative' }}>
      <div ref={targetRef} data-testid="target" />
      <TransformChrome chrome={api} />
    </div>
  )
}

describe('<TransformChrome /> integration', () => {
  it('routes a pointerdown on the se handle to the controller and commits a resize', () => {
    const scheduler = new ManualScheduler()
    const commits: GestureCommit[] = []
    const apiRef = { current: null as ReturnType<typeof useTransformController> | null }
    const { container } = render(
      <Integration scheduler={scheduler} commits={commits} apiRef={apiRef} />,
    )

    const target = container.querySelector('[data-testid="target"]') as HTMLElement
    // Give the target a concrete 100×100 layout box (jsdom reports 0 otherwise).
    Object.defineProperty(target, 'offsetWidth', { value: 100, configurable: true })
    Object.defineProperty(target, 'offsetHeight', { value: 100, configurable: true })
    target.getBoundingClientRect = () => sizedRect(100, 100)

    act(() => {
      apiRef.current?.setTarget(target)
    })

    const se = container.querySelector('[data-placeable-handle="se"]') as HTMLElement
    expect(se).not.toBeNull()

    act(() => {
      se.dispatchEvent(pointer('pointerdown', 100, 100))
      se.dispatchEvent(pointer('pointermove', 150, 150))
      scheduler.flush()
      se.dispatchEvent(pointer('pointerup', 150, 150))
    })

    expect(commits).toHaveLength(1)
    expect(commits[0]?.box.width).toBe(150)
    expect(commits[0]?.box.height).toBe(150)
  })
})
