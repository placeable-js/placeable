import type { FrameScheduler } from '../gesture/types'

/** Handle returned by {@link observeViewport}. */
export interface ViewportObserver {
  /**
   * Start (or stop, with `null`) watching the active target's size, so an
   * external resize of the selected element re-aligns the chrome. Idempotent
   * for the same node.
   */
  observeTarget(target: Element | null): void
  /** Remove the `ResizeObserver` and every scroll listener. Idempotent; leaks nothing. */
  dispose(): void
}

/** Overflow values that make an element a scroll port for its descendants. */
const SCROLLABLE = /\b(?:auto|scroll|overlay)\b/

function isScrollable(element: Element): boolean {
  const style = getComputedStyle(element)
  return SCROLLABLE.test(`${style.overflowX} ${style.overflowY}`)
}

/**
 * The container, each scrollable ancestor up the tree, and the document's
 * window — the surfaces whose scrolling moves the container in the viewport and
 * thus desyncs a view-space overlay. Nested-scroll completeness beyond this
 * chain is a documented host concern (the host can call `syncChrome()`).
 */
function scrollTargets(container: Element): EventTarget[] {
  const targets: EventTarget[] = []
  for (let node: Element | null = container; node !== null; node = node.parentElement) {
    if (isScrollable(node)) {
      targets.push(node)
    }
  }
  const view = container.ownerDocument.defaultView
  if (view !== null) {
    targets.push(view)
  }
  return targets
}

/**
 * Wires the observers that keep the chrome glued to its target while idle: a
 * `ResizeObserver` on the container (and, via {@link ViewportObserver.observeTarget},
 * the active target) plus **passive** `scroll` listeners on the container, its
 * scrollable ancestors, and the window.
 *
 * Every signal is coalesced to **one `onResync` per frame** through the injected
 * {@link FrameScheduler} (no layout thrash, no resync storm). The scheduler must
 * be **dedicated to the viewport** — sharing the gesture session's scheduler
 * would let a resize-driven `ResizeObserver` clobber a pending gesture frame.
 * `dispose()` removes everything and cancels any pending frame.
 *
 * Mid-gesture scroll/zoom is out of Phase 3 (the frame is begin-captured); the
 * caller is expected to drop resyncs while a gesture is active.
 */
export function observeViewport(
  container: Element,
  onResync: () => void,
  scheduler: FrameScheduler,
): ViewportObserver {
  const requestResync = (): void => {
    scheduler.schedule(onResync)
  }

  const resizeObserver = new ResizeObserver(requestResync)
  resizeObserver.observe(container)
  let observedTarget: Element | null = null

  const targets = scrollTargets(container)
  for (const surface of targets) {
    surface.addEventListener('scroll', requestResync, { passive: true })
  }

  let disposed = false
  return {
    observeTarget(target: Element | null): void {
      if (target === observedTarget) {
        return
      }
      if (observedTarget !== null) {
        resizeObserver.unobserve(observedTarget)
      }
      observedTarget = target
      if (target !== null) {
        resizeObserver.observe(target)
      }
    },
    dispose(): void {
      if (disposed) {
        return
      }
      disposed = true
      scheduler.cancel()
      resizeObserver.disconnect()
      for (const surface of targets) {
        surface.removeEventListener('scroll', requestResync)
      }
    },
  }
}
