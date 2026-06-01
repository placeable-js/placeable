import type { RoundingPolicy } from '../coords/rounding'
import { CoordinateSpace } from '../coords/space'
import type { ContainerBox } from '../coords/types'
import type { Handle } from '../gesture/operations/handles'
import type { ResizeOptions, SizeBounds } from '../gesture/operations/resize'
import type { RotateOptions } from '../gesture/operations/rotate'
import { rafScheduler } from '../gesture/scheduler'
import { GestureSession } from '../gesture/session'
import type {
  CoordinateSpaceLike,
  FrameScheduler,
  GestureCallbacks,
  GestureInput,
  GestureTarget,
  Modifier,
} from '../gesture/types'
import type { Vec2 } from '../math/types'
import { idleChromeBox } from './chrome-geometry'
import { computeFrame } from './compute-frame'
import { PointerSource } from './pointer-source'
import { readBoxFromElement } from './read-box'
import { resolveOperation } from './resolve-operation'
import { DomTransformWriter } from './transform-writer'
import { observeViewport, type ViewportObserver } from './viewport-sync'

const RAD_TO_DEG = 180 / Math.PI
const ORIGIN: Vec2 = { x: 0, y: 0 }
const ALL_HANDLES: readonly Handle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

/** The set of gizmos the chrome should render for the current target. Low-frequency; forward-compatible with Phase 4 per-target policy. */
export interface HandleConfig {
  /** Resize handles to show. */
  readonly handles: readonly Handle[]
  /** Whether the rotate handle is shown. */
  readonly rotatable: boolean
}

/**
 * The **low-frequency** chrome state carried by the store — *what to mount*, not
 * *where to put it*. The position is written imperatively and never lives here,
 * so subscribers (React) re-render only on selection / visibility / config
 * change, never on motion (gesture **or** scroll).
 */
export interface ChromeState {
  /** The currently selected target, or `null` when nothing is selected. */
  readonly target: HTMLElement | null
  /** Whether the overlay should be mounted at all (omitted entirely when false). */
  readonly visible: boolean
  /** Which handles the overlay renders. */
  readonly handleConfig: HandleConfig
}

/** Options for {@link createTransformController}. */
export interface TransformControllerOptions {
  /**
   * The scroll/viewport element that defines **container** space and against
   * which the chrome overlay is positioned. Required — the one host-chosen
   * reference (no `offsetParent` guessing).
   */
  readonly container: Element
  /** Current zoom (design px → view px), read at each `begin`. Defaults to `1`. Host-owned. */
  readonly getViewScale?: () => number
  /** Current pan (container-space offset of the design origin), read at each `begin`. Defaults to `(0,0)`. Host-owned. */
  readonly getPan?: () => Vec2
  /** Resize bounds / aspect applied to whichever handle is grabbed. */
  readonly resize?: {
    readonly min?: SizeBounds
    readonly max?: SizeBounds
    readonly aspect?: ResizeOptions['aspect']
  }
  /** Rotate pivot for the rotate handle. */
  readonly rotate?: RotateOptions
  /** Resize handles the chrome renders. Defaults to all eight. */
  readonly handles?: readonly Handle[]
  /** Whether the rotate handle renders. Defaults to `true`. */
  readonly rotatable?: boolean
  /** Modifier chain, applied in order after the kernel. */
  readonly modifiers?: readonly Modifier[]
  /** Containment region in container space. */
  readonly bounds?: ContainerBox
  /** Commit-time rounding policy. */
  readonly rounding?: RoundingPolicy
  /** Frame coalescer for the **gesture session**. Defaults to `requestAnimationFrame`. */
  readonly scheduler?: FrameScheduler
  /** Lifecycle callbacks (forwarded; the chrome is reconciled after commit/cancel). */
  readonly callbacks?: GestureCallbacks
}

/** The framework-free engine the adapters wrap. See {@link createTransformController}. */
export interface TransformController {
  /** Select (or clear, with `null`) the host-provided target; reconciles chrome geometry and the store. */
  setTarget(target: HTMLElement | null): void
  /** Wire the delegated {@link PointerSource} to a chrome root element; returns a disposer. */
  attachChrome(root: HTMLElement): () => void
  /** Register (or clear, with `null`) the overlay node the controller writes the box to. Writes the current box on register. */
  attachOverlayNode(node: HTMLElement | null): void
  /** Re-measure and re-align the chrome to the live target (idle reconciliation). Auto-invoked on scroll/resize; callable by the host after an external idle mutation. */
  syncChrome(): void
  /** Subscribe to low-frequency {@link ChromeState} changes (the `useSyncExternalStore` contract). */
  subscribe(listener: () => void): () => void
  /** The current low-frequency {@link ChromeState}; referentially stable until target/visibility/config changes. */
  getState(): ChromeState
  /** The current chrome box in container space, or `null` when nothing is selected (for an overlay's initial imperative write). */
  getChromeBox(): ContainerBox | null
  /** Dispose the source, observers, and session. Idempotent; leaks nothing. */
  destroy(): void
}

/**
 * Creates the headless engine that powers the chrome: **one** reusable
 * {@link GestureSession}, **one** delegated {@link PointerSource} on the chrome
 * root, idle geometry + viewport observers, and a low-frequency subscription —
 * with a tiny imperative surface. All chrome motion goes through one
 * `applyChromeBox` path (gesture `onChange` **and** `syncChrome`), so the store
 * never carries the box and subscribers never re-render on motion. Contains no
 * framework import; the React adapter is a thin binding over this.
 *
 * Coordinate ownership: the controller measures `containerOrigin` (the container
 * rect) at each `begin`/sync; `viewScale`/`pan` are host-supplied via getters
 * and affect only the design-space commit (chrome geometry is pure container
 * space, hence zoom-model-agnostic).
 */
export function createTransformController(
  options: TransformControllerOptions,
): TransformController {
  const container = options.container
  const getViewScale = options.getViewScale ?? (() => 1)
  const getPan = options.getPan ?? (() => ORIGIN)
  const resolveOptions = {
    ...(options.resize !== undefined && { resize: options.resize }),
    ...(options.rotate !== undefined && { rotate: options.rotate }),
  }
  const handleConfig: HandleConfig = {
    handles: options.handles ?? ALL_HANDLES,
    rotatable: options.rotatable ?? true,
  }
  const hostCallbacks = options.callbacks ?? {}

  let target: HTMLElement | null = null
  let overlayNode: HTMLElement | null = null
  let chromeBox: ContainerBox | null = null
  let chromeSource: PointerSource | null = null
  let pendingTarget: GestureTarget | null = null
  let space: CoordinateSpace
  let state: ChromeState = { target: null, visible: false, handleConfig }
  const listeners = new Set<() => void>()

  const buildSpace = (): CoordinateSpace => {
    const rect = container.getBoundingClientRect()
    space = new CoordinateSpace({
      containerOrigin: { x: rect.left, y: rect.top },
      viewScale: getViewScale(),
      pan: getPan(),
    })
    return space
  }
  space = buildSpace()

  const applyChromeBox = (box: ContainerBox): void => {
    chromeBox = box
    if (overlayNode === null) {
      return
    }
    const degrees = box.rotation * RAD_TO_DEG
    const style = overlayNode.style
    style.transform = `translate(${box.x}px, ${box.y}px) rotate(${degrees}deg)`
    style.width = `${box.width}px`
    style.height = `${box.height}px`
  }

  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  const setState = (next: ChromeState): void => {
    if (
      state.target === next.target &&
      state.visible === next.visible &&
      state.handleConfig === next.handleConfig
    ) {
      return
    }
    state = next
    notify()
  }

  // Container ↔ design conversion for the session's commit/readout boundary;
  // always reads the latest measured space (rebuilt at each begin).
  const sessionSpace: CoordinateSpaceLike = {
    containerToDesignBox: (box) => space.containerToDesignBox(box),
  }

  const session = new GestureSession({
    space: sessionSpace,
    ...(options.modifiers !== undefined && { modifiers: options.modifiers }),
    ...(options.bounds !== undefined && { bounds: options.bounds }),
    ...(options.rounding !== undefined && { rounding: options.rounding }),
    ...(options.scheduler !== undefined && { scheduler: options.scheduler }),
    callbacks: {
      onStart: (snapshot) => {
        applyChromeBox(snapshot.container)
        hostCallbacks.onStart?.(snapshot)
      },
      onChange: (snapshot) => {
        // Imperative reposition only — no store push, so React never renders per frame.
        applyChromeBox(snapshot.container)
        hostCallbacks.onChange?.(snapshot)
      },
      onCommit: (commit) => {
        hostCallbacks.onCommit?.(commit)
        syncChrome() // reconcile to the host-owned DOM
      },
      onCancel: () => {
        hostCallbacks.onCancel?.()
        syncChrome() // target reverted to its start box
      },
    },
  })

  function syncChrome(): void {
    if (target === null) {
      return
    }
    applyChromeBox(idleChromeBox(target, container))
  }

  // The viewport observer uses its OWN scheduler, independent of the session's,
  // so a resize-driven ResizeObserver can never clobber a pending gesture frame.
  const observer: ViewportObserver = observeViewport(
    container,
    () => {
      // Mid-gesture scroll-follow is out of Phase 3 (frame is begin-captured).
      if (session.phase === 'active') {
        return
      }
      syncChrome()
    },
    rafScheduler(),
  )

  const shouldBegin = (event: PointerEvent): boolean => {
    if (target === null) {
      return false
    }
    const eventTarget = event.target as Element | null
    const handleEl = eventTarget?.closest('[data-placeable-handle]') ?? null
    if (handleEl === null) {
      return false
    }
    const handle = handleEl.getAttribute('data-placeable-handle')
    if (handle === null) {
      return false
    }
    const operation = resolveOperation(handle, resolveOptions)
    if (operation === null) {
      return false
    }
    const startBox = readBoxFromElement(target)
    const { frame } = computeFrame(target, container, startBox)
    pendingTarget = { startBox, writer: new DomTransformWriter(target), operation, frame }
    return true
  }

  const onInput = (input: GestureInput): void => {
    switch (input.type) {
      case 'begin':
        // `pendingTarget` is set by `shouldBegin`, which the source runs
        // synchronously before this fires; the guard is a defensive invariant.
        /* v8 ignore next */
        if (pendingTarget !== null) {
          session.begin(pendingTarget, input.pointer, input.modifiers)
        }
        break
      case 'move':
        session.update(input.pointer, input.modifiers)
        break
      case 'end':
        session.end(input.pointer, input.modifiers)
        break
      case 'cancel':
        session.cancel()
        break
    }
  }

  return {
    setTarget(next: HTMLElement | null): void {
      target = next
      observer.observeTarget(next)
      if (next !== null) {
        applyChromeBox(idleChromeBox(next, container))
      } else {
        chromeBox = null
      }
      setState({ target: next, visible: next !== null, handleConfig })
    },
    attachChrome(root: HTMLElement): () => void {
      const source = new PointerSource(root, buildSpace, onInput, shouldBegin)
      chromeSource = source
      return () => {
        source.destroy()
        if (chromeSource === source) {
          chromeSource = null
        }
      }
    },
    attachOverlayNode(node: HTMLElement | null): void {
      overlayNode = node
      if (node !== null && chromeBox !== null) {
        applyChromeBox(chromeBox)
      }
    },
    syncChrome,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getState: () => state,
    getChromeBox: () => chromeBox,
    destroy(): void {
      chromeSource?.destroy()
      chromeSource = null
      observer.dispose()
      session.destroy()
    },
  }
}
