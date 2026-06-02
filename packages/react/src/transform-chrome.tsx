'use client'

import type { Handle } from '@placeable-js/core'
import type { CSSProperties, ReactNode } from 'react'
import type { UseTransformControllerResult } from './use-transform-controller'

/** A handle the chrome can render a custom visual for: the eight resize handles plus `rotate`. */
export type ChromeHandleName = Handle | 'rotate'

/** Position of each handle in the control box's **local** frame (percent of the box), screen axes (`n` = top). */
const HANDLE_POSITION: Readonly<Record<Handle, { readonly left: string; readonly top: string }>> = {
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
  nw: { left: '0%', top: '0%' },
}

const CURSOR: Readonly<Record<Handle, string>> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

const ROOT_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  pointerEvents: 'none',
}

/**
 * The control box itself. Positioned **imperatively** by the controller (it owns
 * `transform`/`width`/`height`); we only set the static layout/origin so its
 * rotation pivot matches the writer's (`transform-origin: 50% 50%`). The box is
 * `pointer-events: none`; its children (body layer, handles) opt back in.
 */
const BOX_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  transformOrigin: '50% 50%',
  boxSizing: 'border-box',
  pointerEvents: 'none',
}

/** Props for {@link TransformChrome}. Presentation only — all behavior lives in the controller via the hook's refs. */
export interface TransformChromeProps {
  /** The result of {@link useTransformController} (its `chromeRef`, `overlayRef`, and low-frequency `state`). */
  readonly chrome: Pick<UseTransformControllerResult, 'chromeRef' | 'overlayRef' | 'state'>
  /** Class applied to the overlay root. */
  readonly className?: string
  /** Extra style merged into the overlay root. */
  readonly style?: CSSProperties
  /** Class applied to the control-box element. */
  readonly boxClassName?: string
  /** Edge length of each handle, in **constant** CSS px (zoom-independent). Defaults to `10`. */
  readonly handleSize?: number
  /** Distance the rotate handle sits above the box's top edge, in CSS px. Defaults to `24`. */
  readonly rotateOffset?: number
  /** Class applied to each handle wrapper. */
  readonly handleClassName?: string
  /** Style merged into each handle wrapper (the default visual is a bordered square). */
  readonly handleStyle?: CSSProperties
  /** Render a custom visual inside a handle. The wrapper keeps `data-placeable-handle`, positioning, and hit area. */
  readonly renderHandle?: (handle: ChromeHandleName) => ReactNode
  /** Optional toolbar rendered inside the box (constant typography; `pointer-events: auto`). */
  readonly toolbar?: ReactNode
  /** Test id applied to the overlay root. */
  readonly 'data-testid'?: string
}

const defaultHandleVisual = (size: number, custom?: CSSProperties): CSSProperties => ({
  width: size,
  height: size,
  boxSizing: 'border-box',
  background: '#ffffff',
  border: '1px solid #4f9eff',
  borderRadius: 2,
  ...custom,
})

/**
 * The sibling overlay that renders the selection chrome: a control box, an
 * optional body-drag layer, the resize handles, an optional rotate handle, and
 * an optional toolbar slot.
 *
 * Behavior is delegated entirely to the controller through the hook's refs:
 * `chromeRef` wires the single delegated pointer source on the root, and the
 * controller writes the box's `transform`/size **imperatively** — React renders
 * this subtree's *structure* (which handles exist), never its *position*. When
 * `state.visible` is false the overlay is omitted entirely, so it never blocks
 * clicks. Handles carry only `data-placeable-handle`; the delegated source reads
 * `closest('[data-placeable-handle]')`, so there are no per-handle listeners.
 *
 * Mount under a **positioned host** as a **sibling of the scrollport** (the
 * element passed as `container`), not inside the scrolling element — same layout
 * as the playground and e2e fixture. The controller measures container space from
 * the scrollport and anchors overlay `translate` to the chrome root's live
 * layout origin. Use `syncChrome()` after external idle mutations.
 */
export function TransformChrome(props: TransformChromeProps): ReactNode {
  const { chrome } = props
  const { state } = chrome
  if (!state.visible) {
    return null
  }

  const handleSize = props.handleSize ?? 10
  const rotateOffset = props.rotateOffset ?? 24
  const { handles, rotatable } = state.handleConfig

  return (
    <div
      ref={chrome.chromeRef}
      className={props.className}
      style={{ ...ROOT_STYLE, ...props.style }}
      data-placeable-chrome=""
      data-testid={props['data-testid']}
    >
      <div
        ref={chrome.overlayRef}
        className={props.boxClassName}
        style={BOX_STYLE}
        data-placeable-box=""
      >
        <div
          data-placeable-handle="body"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'move' }}
        />
        {handles.map((handle) => {
          const pos = HANDLE_POSITION[handle]
          return (
            <div
              key={handle}
              data-placeable-handle={handle}
              className={props.handleClassName}
              style={{
                position: 'absolute',
                left: pos.left,
                top: pos.top,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto',
                cursor: CURSOR[handle],
                ...(props.renderHandle === undefined
                  ? defaultHandleVisual(handleSize, props.handleStyle)
                  : { width: handleSize, height: handleSize, ...props.handleStyle }),
              }}
            >
              {props.renderHandle?.(handle)}
            </div>
          )
        })}
        {rotatable ? (
          <div
            data-placeable-handle="rotate"
            className={props.handleClassName}
            style={{
              position: 'absolute',
              left: '50%',
              top: -rotateOffset,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              cursor: 'grab',
              ...(props.renderHandle === undefined
                ? { ...defaultHandleVisual(handleSize, props.handleStyle), borderRadius: '50%' }
                : { width: handleSize, height: handleSize, ...props.handleStyle }),
            }}
          >
            {props.renderHandle?.('rotate')}
          </div>
        ) : null}
        {props.toolbar !== undefined ? (
          <div data-placeable-toolbar="" style={{ position: 'absolute', pointerEvents: 'auto' }}>
            {props.toolbar}
          </div>
        ) : null}
      </div>
    </div>
  )
}
