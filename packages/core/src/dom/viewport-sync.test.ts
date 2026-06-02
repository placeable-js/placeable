import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ManualScheduler } from '../test-utils/manual-scheduler'
import { observeViewport } from './viewport-sync'

type MutableGlobal = Record<string, unknown>
const globalRef = globalThis as MutableGlobal

/** Fake ResizeObserver that records observed nodes and lets a test fire its callback. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly callback: () => void
  readonly observed = new Set<unknown>()
  disconnected = false
  constructor(callback: () => void) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(target: unknown): void {
    this.observed.add(target)
  }
  unobserve(target: unknown): void {
    this.observed.delete(target)
  }
  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }
  trigger(): void {
    this.callback()
  }
}

interface Listener {
  readonly type: string
  readonly handler: (event: unknown) => void
  readonly options?: AddEventListenerOptions
}

/** A scroll surface (element or window) that records add/remove and can dispatch. */
class FakeSurface {
  readonly listeners: Listener[] = []
  readonly removed: string[] = []
  overflowX = 'visible'
  overflowY = 'visible'
  parentElement: FakeSurface | null = null
  ownerDocument: { defaultView: FakeSurface | null }

  constructor(view: FakeSurface | null = null) {
    this.ownerDocument = { defaultView: view }
  }

  addEventListener(
    type: string,
    handler: (event: unknown) => void,
    options?: AddEventListenerOptions,
  ) {
    this.listeners.push({ type, handler, ...(options !== undefined && { options }) })
  }
  removeEventListener(type: string) {
    this.removed.push(type)
  }
  dispatch(type: string): void {
    for (const l of this.listeners) {
      if (l.type === type) l.handler({})
    }
  }
}

function asElement(s: FakeSurface): Element {
  return s as unknown as Element
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  globalRef.ResizeObserver = FakeResizeObserver
  globalRef.getComputedStyle = (el: unknown) => {
    const s = el as FakeSurface
    return { overflowX: s.overflowX, overflowY: s.overflowY }
  }
})

afterEach(() => {
  delete globalRef.ResizeObserver
  delete globalRef.getComputedStyle
})

describe('observeViewport', () => {
  it('coalesces a burst of scroll + resize signals into one onResync per frame', () => {
    const win = new FakeSurface()
    const container = new FakeSurface(win)
    container.overflowX = 'auto'
    const scheduler = new ManualScheduler()
    let resyncs = 0
    observeViewport(asElement(container), () => resyncs++, scheduler)

    const ro = FakeResizeObserver.instances[0]
    if (!ro) throw new Error('no ResizeObserver was created')

    container.dispatch('scroll')
    container.dispatch('scroll')
    win.dispatch('scroll')
    ro.trigger()
    ro.trigger()

    // Scheduled, not yet run — the scheduler holds a single pending frame.
    expect(resyncs).toBe(0)
    scheduler.flush()
    expect(resyncs).toBe(1) // exactly one resync for the whole burst
  })

  it('attaches scroll listeners as passive on the container, ancestors, and window', () => {
    const win = new FakeSurface()
    const ancestor = new FakeSurface(win)
    ancestor.overflowY = 'scroll'
    const container = new FakeSurface(win)
    container.parentElement = ancestor
    container.overflowX = 'auto'

    observeViewport(asElement(container), () => {}, new ManualScheduler())

    for (const surface of [container, ancestor, win]) {
      const scroll = surface.listeners.find((l) => l.type === 'scroll')
      expect(scroll?.options?.passive).toBe(true)
    }
  })

  it('skips non-scrollable ancestors when choosing scroll targets', () => {
    const win = new FakeSurface()
    const plain = new FakeSurface(win) // overflow: visible → not a scroll port
    const container = new FakeSurface(win)
    container.parentElement = plain
    container.overflowX = 'auto'

    observeViewport(asElement(container), () => {}, new ManualScheduler())

    expect(plain.listeners.some((l) => l.type === 'scroll')).toBe(false)
    expect(container.listeners.some((l) => l.type === 'scroll')).toBe(true)
  })

  it('omits the window when the document has no default view', () => {
    const container = new FakeSurface(null) // ownerDocument.defaultView === null
    container.overflowX = 'auto'

    observeViewport(asElement(container), () => {}, new ManualScheduler())
    // Only the container itself is a scroll target.
    expect(container.listeners.filter((l) => l.type === 'scroll')).toHaveLength(1)
  })

  it('observes and re-observes the active target via the ResizeObserver', () => {
    const win = new FakeSurface()
    const container = new FakeSurface(win)
    const observer = observeViewport(asElement(container), () => {}, new ManualScheduler())
    const ro = FakeResizeObserver.instances[0]
    if (!ro) throw new Error('no ResizeObserver was created')

    expect(ro.observed.has(container)).toBe(true)

    const t1 = new FakeSurface()
    const t2 = new FakeSurface()
    observer.observeTarget(asElement(t1))
    expect(ro.observed.has(t1)).toBe(true)

    observer.observeTarget(asElement(t1)) // same node → no-op
    expect(ro.observed.size).toBe(2)

    observer.observeTarget(asElement(t2))
    expect(ro.observed.has(t1)).toBe(false)
    expect(ro.observed.has(t2)).toBe(true)

    observer.observeTarget(null) // clears the target, keeps the container
    expect(ro.observed.has(t2)).toBe(false)
    expect(ro.observed.has(container)).toBe(true)
  })

  it('dispose removes every listener, disconnects the observer, and is idempotent', () => {
    const win = new FakeSurface()
    const container = new FakeSurface(win)
    container.overflowX = 'auto'
    const scheduler = new ManualScheduler()
    const observer = observeViewport(asElement(container), () => {}, scheduler)
    const ro = FakeResizeObserver.instances[0]
    if (!ro) throw new Error('no ResizeObserver was created')

    observer.dispose()
    observer.dispose() // idempotent

    expect(ro.disconnected).toBe(true)
    expect(container.removed).toContain('scroll')
    expect(win.removed).toContain('scroll')
    expect(scheduler.hasPending).toBe(false)
  })
})
