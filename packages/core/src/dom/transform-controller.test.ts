import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManualScheduler } from '../test-utils/manual-scheduler'
import { createTransformController, type TransformController } from './transform-controller'

type MutableGlobal = Record<string, unknown>
const globalRef = globalThis as MutableGlobal

/** Identity-only DOMMatrix: the harness never produces transformed ancestors. */
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

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  trigger(): void {
    this.callback()
  }
}

/** A captured single rAF callback the test flushes by hand. */
let rafCallback: (() => void) | null = null

function flushRaf(): void {
  const cb = rafCallback
  rafCallback = null
  cb?.()
}

/** Records the chrome's imperative position writes. */
function makeOverlay() {
  const transforms: string[] = []
  let width = ''
  let height = ''
  const style = {
    set transform(value: string) {
      transforms.push(value)
    },
    get transform() {
      return transforms.at(-1) ?? ''
    },
    set width(value: string) {
      width = value
    },
    get width() {
      return width
    },
    set height(value: string) {
      height = value
    },
    get height() {
      return height
    },
  }
  return { node: { style } as unknown as HTMLElement, transforms }
}

function makeChromeRoot(rect: { left: number; top: number } = { left: 0, top: 0 }) {
  const handlers = new Map<string, (event: PointerEvent) => void>()
  const removeEventListener = vi.fn((type: string) => handlers.delete(type))
  const root = {
    style: { touchAction: 'auto' },
    getBoundingClientRect: () => ({ left: rect.left, top: rect.top, width: 400, height: 300 }),
    addEventListener: (type: string, handler: (event: PointerEvent) => void) =>
      handlers.set(type, handler),
    removeEventListener,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  }
  const dispatch = (type: string, event: Partial<PointerEvent>) =>
    handlers.get(type)?.(event as PointerEvent)
  return { node: root as unknown as HTMLElement, dispatch, removeEventListener }
}

/** A target laid out directly in the container (identity frame), size 100×100 at origin. */
function makeTarget() {
  return {
    __transform: 'none',
    style: { transform: '', transformOrigin: '', width: '', height: '', willChange: '' },
    offsetWidth: 100,
    offsetHeight: 100,
    parentElement: null as unknown,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  }
}

function makeWindow() {
  const removed: string[] = []
  return {
    addEventListener: () => {},
    removeEventListener: (type: string) => removed.push(type),
    removed,
  }
}

/** A pointerdown landing on the handle named `handle` (or a miss when `null`). */
function handleEvent(handle: string | null, clientX: number, clientY: number) {
  const handleEl =
    handle === null
      ? null
      : { getAttribute: (name: string) => (name === 'data-placeable-handle' ? handle : null) }
  const eventTarget = {
    closest: (sel: string) => (sel === '[data-placeable-handle]' ? handleEl : null),
  }
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
    target: eventTarget,
  } as unknown as Partial<PointerEvent>
}

let win: ReturnType<typeof makeWindow>
let target: ReturnType<typeof makeTarget>
let container: { parentElement: null; ownerDocument: unknown; getBoundingClientRect: () => DOMRect }

beforeEach(() => {
  FakeResizeObserver.instances = []
  rafCallback = null
  win = makeWindow()
  target = makeTarget()
  container = {
    parentElement: null,
    ownerDocument: { defaultView: win },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect,
  }
  // Target is a direct child of the container → identity ancestor frame.
  target.parentElement = container
  globalRef.DOMMatrix = FakeDOMMatrix
  globalRef.ResizeObserver = FakeResizeObserver
  globalRef.requestAnimationFrame = (cb: () => void) => {
    rafCallback = cb
    return 1
  }
  globalRef.cancelAnimationFrame = () => {
    rafCallback = null
  }
  globalRef.getComputedStyle = (el: unknown) => {
    const fake = el as { __transform?: string }
    return { transform: fake.__transform ?? 'none', overflowX: 'visible', overflowY: 'visible' }
  }
})

afterEach(() => {
  delete globalRef.DOMMatrix
  delete globalRef.ResizeObserver
  delete globalRef.requestAnimationFrame
  delete globalRef.cancelAnimationFrame
  delete globalRef.getComputedStyle
})

function setup() {
  const scheduler = new ManualScheduler()
  const overlay = makeOverlay()
  const chrome = makeChromeRoot()
  const commits: { box: { width: number; rotation: number } }[] = []
  const controller = createTransformController({
    container: container as unknown as Element,
    scheduler,
    callbacks: { onCommit: (commit) => commits.push(commit) },
  })
  let pushes = 0
  controller.subscribe(() => {
    pushes++
  })
  controller.attachChrome(chrome.node)
  controller.attachOverlayNode(overlay.node)
  return {
    controller,
    scheduler,
    overlay,
    chrome,
    commits,
    pushCount: () => pushes,
  }
}

describe('createTransformController gesture path', () => {
  it('begins a resize on a handle pointerdown and writes the box imperatively with no store push', () => {
    const { controller, scheduler, overlay, chrome, commits } = setup()
    controller.setTarget(target as unknown as HTMLElement)
    const transformsAfterSelect = overlay.transforms.length

    let pushesDuringGesture = 0
    controller.subscribe(() => {
      pushesDuringGesture++
    })

    chrome.dispatch('pointerdown', handleEvent('se', 100, 100))
    chrome.dispatch('pointermove', handleEvent('se', 130, 130))
    scheduler.flush()

    // The chrome moved imperatively (onStart + onChange writes), with no re-render.
    expect(overlay.transforms.length).toBeGreaterThan(transformsAfterSelect)
    expect(overlay.node.style.width).toBe('130px')
    expect(pushesDuringGesture).toBe(0)

    chrome.dispatch('pointerup', handleEvent('se', 130, 130))
    expect(commits).toHaveLength(1)
    expect(commits[0]?.box.width).toBe(130)
    expect(commits[0]?.box.rotation).toBeCloseTo(0, 9)
    expect(pushesDuringGesture).toBe(0) // commit + syncChrome push nothing
  })

  it('ignores a pointerdown that misses every handle', () => {
    const { controller, scheduler, chrome, commits } = setup()
    controller.setTarget(target as unknown as HTMLElement)

    chrome.dispatch('pointerdown', handleEvent(null, 10, 10))
    chrome.dispatch('pointermove', handleEvent(null, 50, 50))
    scheduler.flush()
    chrome.dispatch('pointerup', handleEvent(null, 50, 50))

    expect(commits).toHaveLength(0)
  })

  it('does not begin a gesture when no target is selected', () => {
    const { chrome, commits } = setup()
    chrome.dispatch('pointerdown', handleEvent('se', 100, 100))
    expect(commits).toHaveLength(0)
  })

  it('ignores a handle element whose data-placeable-handle attribute is missing', () => {
    const { controller, chrome, commits } = setup()
    controller.setTarget(target as unknown as HTMLElement)

    const blankHandle = { getAttribute: () => null }
    const eventTarget = {
      closest: (sel: string) => (sel === '[data-placeable-handle]' ? blankHandle : null),
    }
    const event = { ...handleEvent('se', 100, 100), target: eventTarget }
    chrome.dispatch('pointerdown', event as unknown as Partial<PointerEvent>)

    expect(commits).toHaveLength(0)
  })

  it('ignores an unrecognized handle value', () => {
    const { controller, chrome, commits } = setup()
    controller.setTarget(target as unknown as HTMLElement)
    chrome.dispatch('pointerdown', handleEvent('center', 100, 100))
    expect(commits).toHaveLength(0)
  })

  it('cancels in flight on pointercancel without committing, then resyncs the chrome', () => {
    const { controller, scheduler, overlay, chrome, commits } = setup()
    controller.setTarget(target as unknown as HTMLElement)
    const writesBeforeCancel = overlay.transforms.length

    chrome.dispatch('pointerdown', handleEvent('se', 100, 100))
    chrome.dispatch('pointermove', handleEvent('se', 130, 130))
    scheduler.flush()
    chrome.dispatch('pointercancel', handleEvent('se', 130, 130))

    expect(commits).toHaveLength(0) // cancel never commits
    expect(overlay.transforms.length).toBeGreaterThan(writesBeforeCancel) // resync write
  })
})

describe('createTransformController scroll/resize reconciliation', () => {
  it('repositions the overlay imperatively on a burst of scroll/resize with zero store pushes', () => {
    const { controller, overlay } = setup()
    controller.setTarget(target as unknown as HTMLElement)

    let pushes = 0
    controller.subscribe(() => {
      pushes++
    })
    const baseline = overlay.transforms.length

    // A burst of viewport signals; the dedicated viewport scheduler coalesces them.
    const ro = FakeResizeObserver.instances[0]
    if (!ro) throw new Error('no ResizeObserver created')
    for (let i = 0; i < 10; i++) {
      ro.trigger()
    }
    flushRaf() // one coalesced resync

    expect(overlay.transforms.length).toBe(baseline + 1) // exactly one imperative write
    expect(pushes).toBe(0) // and zero re-renders
  })

  it('does not write a misaligned overlay when the chrome root has no layout box', () => {
    const overlay = makeOverlay()
    const chrome = makeChromeRoot()
    chrome.node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 })

    const controller = createTransformController({
      container: container as unknown as Element,
    })
    controller.attachChrome(chrome.node)
    controller.attachOverlayNode(overlay.node)
    controller.setTarget(target as unknown as HTMLElement)

    expect(overlay.transforms.length).toBe(0)
  })

  it('applies overlay position after the host shows a hidden chrome root on select', () => {
    const overlay = makeOverlay()
    const chrome = makeChromeRoot()
    let measurable = false
    chrome.node.getBoundingClientRect = () =>
      measurable
        ? { left: 0, top: 0, width: 400, height: 300 }
        : { left: 0, top: 0, width: 0, height: 0 }
    const baseGetComputedStyle = globalRef.getComputedStyle as (el: unknown) => CSSStyleDeclaration
    globalRef.getComputedStyle = (el: unknown) => {
      if (el === chrome.node) {
        return { ...baseGetComputedStyle(el), display: measurable ? 'block' : 'none' }
      }
      return baseGetComputedStyle(el)
    }

    const controller = createTransformController({
      container: container as unknown as Element,
    })
    controller.attachChrome(chrome.node)
    controller.attachOverlayNode(overlay.node)
    controller.subscribe(() => {
      if (controller.getState().visible) {
        measurable = true
      }
    })
    controller.setTarget(target as unknown as HTMLElement)

    const transform = overlay.transforms.at(-1) ?? ''
    expect(transform).toContain('translate(0px, 0px)')
    expect(transform).not.toMatch(/translate\(304px/)
  })

  it('subtracts the chrome root offset so overlay translate stays correct when the root scrolls with content', () => {
    const scheduler = new ManualScheduler()
    const overlay = makeOverlay()
    const chrome = makeChromeRoot({ left: 0, top: -120 })
    const controller = createTransformController({
      container: container as unknown as Element,
      scheduler,
    })
    controller.attachChrome(chrome.node)
    controller.attachOverlayNode(overlay.node)
    controller.setTarget(target as unknown as HTMLElement)

    // Simulate scroll: chrome root moved up in the scrollable layer; target
    // re-measured at container y=60 in visible space.
    target.getBoundingClientRect = () => ({ left: 0, top: 60, width: 100, height: 100 })
    controller.syncChrome()

    const transform = overlay.transforms.at(-1) ?? ''
    // translate y = 60 - (-120) = 180, not 60 (which would pin chrome too high).
    expect(transform).toContain('translate(0px, 180px)')
  })

  it('ignores a viewport resync once the target is cleared', () => {
    const { controller, overlay } = setup()
    controller.setTarget(target as unknown as HTMLElement)
    controller.setTarget(null)
    const baseline = overlay.transforms.length

    const ro = FakeResizeObserver.instances[0]
    if (!ro) throw new Error('no ResizeObserver created')
    ro.trigger()
    flushRaf() // resync requested, but target is null → no write

    expect(overlay.transforms.length).toBe(baseline)
  })

  it('drops a resync that arrives mid-gesture (scroll-follow is out of scope)', () => {
    const { controller, scheduler, overlay, chrome } = setup()
    controller.setTarget(target as unknown as HTMLElement)

    chrome.dispatch('pointerdown', handleEvent('se', 100, 100))
    const writesDuringGesture = overlay.transforms.length

    const ro = FakeResizeObserver.instances[0]
    if (!ro) throw new Error('no ResizeObserver created')
    ro.trigger()
    flushRaf() // resync requested while active → ignored

    expect(overlay.transforms.length).toBe(writesDuringGesture)
    chrome.dispatch('pointerup', handleEvent('se', 100, 100))
    scheduler.flush()
  })
})

describe('createTransformController store', () => {
  it('flips visible with exactly one push on select and on clear', () => {
    const { controller } = setup()
    let pushes = 0
    controller.subscribe(() => {
      pushes++
    })

    controller.setTarget(target as unknown as HTMLElement)
    expect(pushes).toBe(1)
    expect(controller.getState().visible).toBe(true)
    expect(controller.getState().target).toBe(target)

    controller.setTarget(null)
    expect(pushes).toBe(2)
    expect(controller.getState().visible).toBe(false)
    expect(controller.getChromeBox()).toBeNull()
  })

  it('pushes only on target/visibility/config change and keeps getState referentially stable', () => {
    const { controller } = setup()
    let pushes = 0
    controller.subscribe(() => {
      pushes++
    })

    controller.setTarget(target as unknown as HTMLElement)
    const stateRef = controller.getState()
    expect(pushes).toBe(1)

    controller.setTarget(target as unknown as HTMLElement) // same target → no change
    controller.syncChrome() // motion → no push
    expect(pushes).toBe(1)
    expect(controller.getState()).toBe(stateRef) // identical reference
  })

  it('stops notifying a listener once it unsubscribes', () => {
    const { controller } = setup()
    let pushes = 0
    const unsubscribe = controller.subscribe(() => {
      pushes++
    })

    controller.setTarget(target as unknown as HTMLElement)
    expect(pushes).toBe(1)

    unsubscribe()
    controller.setTarget(null) // would push, but listener is gone
    expect(pushes).toBe(1)
  })

  it('writes the current box when an overlay node registers after selection (no first-frame flash)', () => {
    const scheduler = new ManualScheduler()
    const controller = createTransformController({
      container: container as unknown as Element,
      scheduler,
    })
    controller.setTarget(target as unknown as HTMLElement)
    expect(controller.getChromeBox()).not.toBeNull()

    const overlay = makeOverlay()
    controller.attachOverlayNode(overlay.node)
    expect(overlay.transforms).toHaveLength(1) // immediate write on register
  })
})

describe('createTransformController teardown', () => {
  it('detaches the chrome source via the disposer', () => {
    const scheduler = new ManualScheduler()
    const controller = createTransformController({
      container: container as unknown as Element,
      scheduler,
    })
    const chrome = makeChromeRoot()
    const dispose = controller.attachChrome(chrome.node)
    dispose()
    expect(chrome.removeEventListener).toHaveBeenCalledTimes(5)
    controller.destroy()
  })

  it('destroy removes listeners/observers and is idempotent', () => {
    const { controller, chrome } = setup()
    controller.setTarget(target as unknown as HTMLElement)

    controller.destroy()
    controller.destroy() // idempotent

    expect(chrome.removeEventListener).toHaveBeenCalledTimes(5)
    expect(win.removed).toContain('scroll')
  })
})

describe('createTransformController host getters', () => {
  it('honors getViewScale on the design-space commit', () => {
    const scheduler = new ManualScheduler()
    const overlay = makeOverlay()
    const chrome = makeChromeRoot()
    const commits: { box: { width: number } }[] = []
    const controller: TransformController = createTransformController({
      container: container as unknown as Element,
      scheduler,
      getViewScale: () => 2,
      callbacks: { onCommit: (commit) => commits.push(commit) },
    })
    controller.attachChrome(chrome.node)
    controller.attachOverlayNode(overlay.node)
    controller.setTarget(target as unknown as HTMLElement)

    chrome.dispatch('pointerdown', handleEvent('e', 100, 50))
    chrome.dispatch('pointermove', handleEvent('e', 140, 50))
    scheduler.flush()
    chrome.dispatch('pointerup', handleEvent('e', 140, 50))

    // East edge driven to container x=140 → local width 140; design = container ÷ 2 = 70.
    expect(commits[0]?.box.width).toBe(70)
  })
})
