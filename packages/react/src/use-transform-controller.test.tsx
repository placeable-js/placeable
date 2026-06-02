import {
  containerBox,
  type GestureCommit,
  type GestureSnapshot,
  pixelRounding,
} from '@placeable-js/core'
import type { ChromeState, TransformControllerOptions } from '@placeable-js/core/dom'
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTransformController } from './use-transform-controller'

const HANDLE_CONFIG = {
  handles: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const,
  rotatable: true,
}

/** A fake controller mirroring the real one's contract: stable state ref, imperative (non-notifying) position. */
class FakeController {
  state: ChromeState = { target: null, visible: false, handleConfig: HANDLE_CONFIG }
  readonly listeners = new Set<() => void>()
  destroyed = false
  syncs = 0
  chromeRoot: HTMLElement | null = null
  overlayNode: HTMLElement | null = null
  chromeDisposed = false
  readonly options: TransformControllerOptions

  constructor(options: TransformControllerOptions) {
    this.options = options
  }

  /** Drives the option getters and callback wrappers exactly as the real session would. */
  simulate(): { viewScale: number; pan: { x: number; y: number } } {
    const viewScale = this.options.getViewScale?.() ?? 1
    const pan = this.options.getPan?.() ?? { x: 0, y: 0 }
    const snapshot = {} as GestureSnapshot
    const commit = {} as GestureCommit
    this.options.callbacks?.onStart?.(snapshot)
    this.options.callbacks?.onChange?.(snapshot)
    this.options.callbacks?.onCommit?.(commit)
    this.options.callbacks?.onCancel?.()
    return { viewScale, pan }
  }

  attachChrome(root: HTMLElement): () => void {
    this.chromeRoot = root
    return () => {
      this.chromeDisposed = true
      this.chromeRoot = null
    }
  }
  attachOverlayNode(node: HTMLElement | null): void {
    this.overlayNode = node
  }
  setTarget(target: HTMLElement | null): void {
    this.state = { target, visible: target !== null, handleConfig: HANDLE_CONFIG }
    for (const l of this.listeners) l()
  }
  syncChrome(): void {
    // Position is written imperatively — never notifies the store.
    this.syncs++
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getState(): ChromeState {
    return this.state
  }
  getChromeBox(): null {
    return null
  }
  destroy(): void {
    this.destroyed = true
  }
}

const created: FakeController[] = []
const factory = vi.fn((options: TransformControllerOptions) => {
  const c = new FakeController(options)
  created.push(c)
  return c
})

vi.mock('@placeable-js/core/dom', () => ({
  createTransformController: (options: TransformControllerOptions) => factory(options),
}))

beforeEach(() => {
  created.length = 0
  factory.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

interface HarnessProps {
  container: Element | null
  onRender?: (count: number, factoryCallsAtRender: number) => void
  apiRef?: { current: ReturnType<typeof useTransformController> | null }
  options?: Partial<Omit<TransformControllerOptions, 'container'>>
}

function Harness({ container, onRender, apiRef, options }: HarnessProps) {
  const renders = useRef(0)
  renders.current += 1
  const api = useTransformController({ container, ...options })
  if (apiRef) {
    apiRef.current = api
  }
  onRender?.(renders.current, factory.mock.calls.length)
  return (
    <div data-testid="chrome" ref={api.chromeRef}>
      <div data-testid="overlay" ref={api.overlayRef} />
      <span data-testid="visible">{String(api.state.visible)}</span>
    </div>
  )
}

describe('useTransformController', () => {
  it('creates exactly one controller after mount and destroys it on unmount', () => {
    const container = document.createElement('div')
    const { unmount } = render(<Harness container={container} />)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(created).toHaveLength(1)
    const controller = created[0]
    expect(controller?.destroyed).toBe(false)

    unmount()
    expect(controller?.destroyed).toBe(true)
    expect(controller?.chromeDisposed).toBe(true)
  })

  it('never constructs the controller during render (only in the layout effect)', () => {
    const container = document.createElement('div')
    let firstRenderFactoryCalls = -1
    render(
      <Harness
        container={container}
        onRender={(count, calls) => {
          if (count === 1) {
            firstRenderFactoryCalls = calls
          }
        }}
      />,
    )
    expect(firstRenderFactoryCalls).toBe(0) // not created during the first render
    expect(factory).toHaveBeenCalledTimes(1) // created afterwards, in the effect
  })

  it('does not create a controller until the container is non-null', () => {
    const { rerender } = render(<Harness container={null} />)
    expect(factory).not.toHaveBeenCalled()

    const container = document.createElement('div')
    rerender(<Harness container={container} />)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('renders once on selection but never on imperative position (syncChrome)', () => {
    const container = document.createElement('div')
    const apiRef = { current: null as ReturnType<typeof useTransformController> | null }
    let renderCount = 0
    render(
      <Harness
        container={container}
        apiRef={apiRef}
        onRender={(count) => {
          renderCount = count
        }}
      />,
    )
    const el = document.createElement('div')
    const afterMount = renderCount

    act(() => {
      apiRef.current?.setTarget(el)
    })
    expect(renderCount).toBe(afterMount + 1) // exactly one render on select
    expect(apiRef.current?.state.visible).toBe(true)

    act(() => {
      apiRef.current?.syncChrome()
      apiRef.current?.syncChrome()
      apiRef.current?.syncChrome()
    })
    expect(renderCount).toBe(afterMount + 1) // position is imperative → no re-render
    expect(created[0]?.syncs).toBe(3)

    act(() => {
      apiRef.current?.setTarget(null)
    })
    expect(renderCount).toBe(afterMount + 2) // one render to hide
    expect(apiRef.current?.state.visible).toBe(false)
  })

  it('wires the chrome and overlay nodes into the controller', () => {
    const container = document.createElement('div')
    render(<Harness container={container} />)
    const controller = created[0]
    expect(controller?.chromeRoot).not.toBeNull()
    expect(controller?.overlayNode).not.toBeNull()
  })

  it('recreates the controller when the container element changes', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    const { rerender } = render(<Harness container={a} />)
    expect(factory).toHaveBeenCalledTimes(1)
    const first = created[0]

    rerender(<Harness container={b} />)
    expect(factory).toHaveBeenCalledTimes(2)
    expect(first?.destroyed).toBe(true) // the old controller is torn down
  })

  it('forwards host getters and callbacks through stable, latest-reading wrappers', () => {
    const container = document.createElement('div')
    const onStart = vi.fn()
    const onChange = vi.fn()
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    render(
      <Harness
        container={container}
        options={{
          getViewScale: () => 3,
          getPan: () => ({ x: 7, y: 9 }),
          callbacks: { onStart, onChange, onCommit, onCancel },
        }}
      />,
    )
    const result = created[0]?.simulate()
    expect(result).toEqual({ viewScale: 3, pan: { x: 7, y: 9 } })
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('defaults the getters and tolerates absent host callbacks', () => {
    const container = document.createElement('div')
    render(<Harness container={container} />)
    const result = created[0]?.simulate() // no host getters/callbacks → defaults, no throw
    expect(result).toEqual({ viewScale: 1, pan: { x: 0, y: 0 } })
  })

  it('forwards every optional controller option when provided', () => {
    const container = document.createElement('div')
    render(
      <Harness
        container={container}
        options={{
          resize: { min: { width: 1 }, max: { width: 100 }, aspect: 1 },
          rotate: { pivot: { x: 0, y: 0 } },
          handles: ['e'],
          rotatable: false,
          modifiers: [],
          bounds: containerBox({ x: 0, y: 0, width: 10, height: 10, rotation: 0 }),
          rounding: pixelRounding(),
          scheduler: { schedule: () => {}, cancel: () => {} },
        }}
      />,
    )
    const opts = created[0]?.options
    expect(opts?.resize).toEqual({ min: { width: 1 }, max: { width: 100 }, aspect: 1 })
    expect(opts?.handles).toEqual(['e'])
    expect(opts?.rotatable).toBe(false)
    expect(opts?.modifiers).toEqual([])
    expect(opts?.bounds).toBeDefined()
    expect(opts?.rounding).toBeDefined()
    expect(opts?.scheduler).toBeDefined()
  })

  it('detaches the chrome and overlay via the React 18 null-argument path', () => {
    const container = document.createElement('div')
    const apiRef = { current: null as ReturnType<typeof useTransformController> | null }
    render(<Harness container={container} apiRef={apiRef} />)
    const controller = created[0]

    const chromeNode = document.createElement('div')
    const overlayNode = document.createElement('div')
    act(() => {
      apiRef.current?.chromeRef(chromeNode)
      apiRef.current?.overlayRef(overlayNode)
    })
    expect(controller?.chromeRoot).toBe(chromeNode)
    expect(controller?.overlayNode).toBe(overlayNode)

    act(() => {
      apiRef.current?.chromeRef(null) // React 18 detach (no cleanup-return support)
      apiRef.current?.overlayRef(null)
    })
    expect(controller?.chromeDisposed).toBe(true)
    expect(controller?.overlayNode).toBeNull()
  })
})
