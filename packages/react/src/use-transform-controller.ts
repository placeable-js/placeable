'use client'

import {
  type ChromeState,
  createTransformController,
  type TransformController,
  type TransformControllerOptions,
} from '@placeable-js/core/dom'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect'

const ALL_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const

/**
 * The server / pre-mount snapshot: **no chrome**. The controller only exists
 * after mount (it reads the DOM), so the server and the first client render both
 * see this — the overlay renders nothing and there is no hydration mismatch.
 */
const SERVER_STATE: ChromeState = {
  target: null,
  visible: false,
  handleConfig: { handles: ALL_HANDLES, rotatable: true },
}

/** A React 19 ref callback that may return a cleanup; also tolerates React 18's `null`-on-detach. */
export type ChromeRefCallback = (node: HTMLElement | null) => (() => void) | undefined

/** Options for {@link useTransformController}. Mirrors the controller, but `container` may be `null` until mounted. */
export interface UseTransformControllerOptions
  extends Omit<TransformControllerOptions, 'container'> {
  /**
   * The scroll/viewport element that defines container space. May be `null`
   * until the host's element is mounted; the controller is created (and the
   * chrome appears) only once it is non-null.
   */
  readonly container: Element | null
}

/** What {@link useTransformController} returns. Positional updates never flow through this — only low-frequency `state`. */
export interface UseTransformControllerResult {
  /** Ref callback for the chrome root — wires the delegated pointer source. */
  readonly chromeRef: ChromeRefCallback
  /** Ref callback for the overlay (control-box) node the controller writes the box to imperatively. */
  readonly overlayRef: ChromeRefCallback
  /** Select (or clear, with `null`) the target. */
  readonly setTarget: (target: HTMLElement | null) => void
  /** Re-align the chrome to the live target after an external idle mutation. */
  readonly syncChrome: () => void
  /** Low-frequency chrome state (`{ target, visible, handleConfig }`); drives mount/unmount, never position. */
  readonly state: ChromeState
}

/**
 * The thin, SSR-safe React binding over the framework-free
 * {@link createTransformController}. It lazily owns one controller (created in a
 * layout effect, **never during render**), bridges its low-frequency
 * subscription to `useSyncExternalStore`, and exposes ref callbacks plus
 * `setTarget`/`syncChrome`. All chrome motion stays imperative in the
 * controller, so this hook re-renders only on selection / visibility / config
 * change — never per gesture or scroll frame.
 */
export function useTransformController(
  options: UseTransformControllerOptions,
): UseTransformControllerResult {
  const controllerRef = useRef<TransformController | null>(null)
  const chromeNodeRef = useRef<HTMLElement | null>(null)
  const overlayNodeRef = useRef<HTMLElement | null>(null)
  const chromeDisposeRef = useRef<(() => void) | null>(null)

  // Latest options, read lazily so changing inline callbacks/getters never
  // recreates the controller (it is rebuilt only when `container` changes).
  const optionsRef = useRef(options)
  optionsRef.current = options

  // A stable external store. The controller's `getState` is referentially
  // stable until target/visibility/config changes, so caching its result here
  // keeps `useSyncExternalStore` tear-free and render-free on motion.
  const store = useRef<{ listeners: Set<() => void>; snapshot: ChromeState }>({
    listeners: new Set(),
    snapshot: SERVER_STATE,
  }).current

  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
    [store],
  )
  const getSnapshot = useCallback(() => store.snapshot, [store])
  const getServerSnapshot = useCallback(() => SERVER_STATE, [])
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const container = options.container

  useIsomorphicLayoutEffect(() => {
    if (container === null) {
      return
    }
    const opts = optionsRef.current
    const controller = createTransformController({
      container,
      getViewScale: () => optionsRef.current.getViewScale?.() ?? 1,
      getPan: () => optionsRef.current.getPan?.() ?? { x: 0, y: 0 },
      ...(opts.resize !== undefined && { resize: opts.resize }),
      ...(opts.rotate !== undefined && { rotate: opts.rotate }),
      ...(opts.handles !== undefined && { handles: opts.handles }),
      ...(opts.rotatable !== undefined && { rotatable: opts.rotatable }),
      ...(opts.modifiers !== undefined && { modifiers: opts.modifiers }),
      ...(opts.bounds !== undefined && { bounds: opts.bounds }),
      ...(opts.rounding !== undefined && { rounding: opts.rounding }),
      ...(opts.scheduler !== undefined && { scheduler: opts.scheduler }),
      callbacks: {
        onStart: (snapshot) => optionsRef.current.callbacks?.onStart?.(snapshot),
        onChange: (snapshot) => optionsRef.current.callbacks?.onChange?.(snapshot),
        onCommit: (commit) => optionsRef.current.callbacks?.onCommit?.(commit),
        onCancel: () => optionsRef.current.callbacks?.onCancel?.(),
      },
    })
    controllerRef.current = controller

    const push = (): void => {
      store.snapshot = controller.getState()
      for (const listener of store.listeners) {
        listener()
      }
    }
    const unsubscribe = controller.subscribe(push)

    // Ref callbacks fire during commit, before this layout effect, so any nodes
    // already attached are wired here. Later node swaps wire via the callbacks.
    if (chromeNodeRef.current !== null) {
      chromeDisposeRef.current = controller.attachChrome(chromeNodeRef.current)
    }
    if (overlayNodeRef.current !== null) {
      controller.attachOverlayNode(overlayNodeRef.current)
    }
    push()

    return () => {
      unsubscribe()
      chromeDisposeRef.current?.()
      chromeDisposeRef.current = null
      controller.destroy()
      controllerRef.current = null
      store.snapshot = SERVER_STATE
      for (const listener of store.listeners) {
        listener()
      }
    }
  }, [container, store])

  const chromeRef = useCallback<ChromeRefCallback>((node) => {
    if (node !== null) {
      chromeNodeRef.current = node
      const controller = controllerRef.current
      if (controller !== null) {
        chromeDisposeRef.current = controller.attachChrome(node)
      }
      return () => {
        chromeDisposeRef.current?.()
        chromeDisposeRef.current = null
        chromeNodeRef.current = null
      }
    }
    // React 18 detach path (no cleanup return support).
    chromeDisposeRef.current?.()
    chromeDisposeRef.current = null
    chromeNodeRef.current = null
  }, [])

  const overlayRef = useCallback<ChromeRefCallback>((node) => {
    overlayNodeRef.current = node
    controllerRef.current?.attachOverlayNode(node)
    if (node !== null) {
      return () => {
        overlayNodeRef.current = null
        controllerRef.current?.attachOverlayNode(null)
      }
    }
  }, [])

  const setTarget = useCallback((target: HTMLElement | null): void => {
    controllerRef.current?.setTarget(target)
  }, [])

  const syncChrome = useCallback((): void => {
    controllerRef.current?.syncChrome()
  }, [])

  return { chromeRef, overlayRef, setTarget, syncChrome, state }
}
