import type { ContainerBox, ContainerPoint, DesignBox } from '../coords/types'
import type { Box, Vec2 } from '../math/types'

/**
 * The state of the four modifier keys at the moment an input is produced.
 * Captured per input so kernels and modifiers stay pure (no live keyboard reads).
 */
export interface ModifierKeys {
  readonly shift: boolean
  readonly alt: boolean
  readonly meta: boolean
  readonly ctrl: boolean
}

/**
 * Gesture-neutral input, in **container** (view px) space. One union fed by
 * every source (pointer now; keyboard and programmatic later). The pointer is
 * omitted from `cancel`, which carries no position.
 */
export type GestureInput =
  | { readonly type: 'begin'; readonly pointer: ContainerPoint; readonly modifiers: ModifierKeys }
  | { readonly type: 'move'; readonly pointer: ContainerPoint; readonly modifiers: ModifierKeys }
  | { readonly type: 'end'; readonly pointer: ContainerPoint; readonly modifiers: ModifierKeys }
  | { readonly type: 'cancel' }

/** Whether a session is between `begin` and a terminal event. */
export type GesturePhase = 'idle' | 'active'

/**
 * Maps between **container** space and the target's **local** (pre-transform)
 * frame, where kernels and modifiers operate. Phase 1 ships only
 * {@link identityFrame}; the nested matrix-stack implementation arrives in
 * Phase 2 without changing any signature that depends on this interface.
 */
export interface GestureFrame {
  /** Maps a container-space point into the target-local frame. */
  pointToLocal(point: ContainerPoint): Vec2
  /** Maps a target-local point back into container space (inverse of {@link pointToLocal}). */
  pointToContainer(point: Vec2): ContainerPoint
  /** Re-expresses a target-local box in container space (bounds tests, readout). */
  boxToContainer(box: Box): ContainerBox
  /** Re-expresses a container-space box in the target-local frame. */
  boxToLocal(box: ContainerBox): Box
}

/**
 * The read-only environment shared by the kernel and every modifier for the
 * duration of a gesture. Intentionally minimal: per-gesture-type parameters
 * (handle, pivot, aspect ratio) are closed over by operation/modifier
 * factories, never threaded through here.
 */
export interface GestureContext {
  /** Active coordinate space (container ↔ design), captured at `begin`. */
  readonly space: CoordinateSpaceLike
  /** Container ↔ target-local mapping. */
  readonly frame: GestureFrame
  /** Optional containment region in container space (used by `bounds`). */
  readonly bounds?: ContainerBox
}

/**
 * The subset of {@link CoordinateSpace} the engine relies on. Declared
 * structurally so `GestureContext` does not couple to the class shape.
 */
export interface CoordinateSpaceLike {
  containerToDesignBox(box: ContainerBox): DesignBox
}

/**
 * The per-frame gesture model, entirely in the target-local frame. All fields
 * are immutable; modifiers return a new state adjusting `proposed` only.
 */
export interface GestureState {
  /** The box captured at `begin`; constant for the gesture. */
  readonly start: Box
  /** The candidate box for this frame (kernel output, then modifier output). */
  readonly proposed: Box
  /** Local-space pointer position at `begin`. */
  readonly pointerStart: Vec2
  /** Local-space pointer position for this frame. */
  readonly pointer: Vec2
  /** Modifier keys for this frame. */
  readonly modifiers: ModifierKeys
}

/**
 * Curated, forward-compatible public view of a gesture, passed to `onStart`
 * and `onChange`. Boxes are in **design** (model) space for property panels.
 */
export interface GestureSnapshot {
  /** Current box in **design** (model) space (live, unrounded). */
  readonly box: DesignBox
  /** The box at `begin`, in **design** space. */
  readonly startBox: DesignBox
  /** Current box in **container** (view) space, for chrome/overlay positioning. */
  readonly container: ContainerBox
}

/**
 * The atomic, history-bearing payload emitted once on `onCommit`, in **design**
 * space and rounded per the active policy. The optional ids keep multi-target
 * (v0.2) from breaking the type.
 */
export interface GestureCommit {
  readonly box: DesignBox
  readonly startBox: DesignBox
  readonly batchId?: string
  readonly targetId?: string
}

/**
 * The pluggable gesture kernel: turns the start box plus current input into a
 * candidate box, in the target-local frame. Constructed per gesture via a
 * factory that closes over its parameters (drag/resize/rotate in Phase 2).
 * Pure.
 */
export interface GestureOperation {
  apply(state: GestureState, ctx: GestureContext): Box
}

/**
 * A pure transform of gesture state, run in array order after the kernel.
 * Adjusts `proposed` only; returns the same reference when it makes no change.
 */
export type Modifier = (state: GestureState, ctx: GestureContext) => GestureState

/**
 * The per-gesture target a reusable {@link GestureSession} is pointed at on
 * `begin`. Bundling `operation` and `writer` here (rather than fixing them at
 * session construction) is what lets a single session serve drag, resize (per
 * handle), and rotate across any number of targets without reallocation — the
 * delegated-chrome model the controller relies on. DOM-free: `writer` and
 * `operation` are the engine's pure seams, so the session never touches the DOM.
 *
 * - `startBox` — the target's current box in its **local** (pre-transform)
 *   frame, measured once by the caller at `begin` (never re-read mid-gesture).
 * - `frame` — the container ↔ local mapping for the live ancestor stack;
 *   defaults to {@link identityFrame} (target laid out directly in container space).
 */
export interface GestureTarget {
  readonly startBox: Box
  readonly writer: TransformWriter
  readonly operation: GestureOperation
  readonly frame?: GestureFrame
}

/**
 * The DOM-write seam. Implemented by the DOM adapter; mocked in headless tests.
 * Synchronous, no return, no layout reads. Lifecycle per gesture:
 * `begin → applyBox* → (release | restore)`.
 */
export interface TransformWriter {
  /** Snapshot the target's style and enter the gesture (e.g. promote layers). */
  begin(): void
  /** Apply a target-local box to the DOM. */
  applyBox(box: Box): void
  /** Revert the target to its pre-gesture style (cancel path). */
  restore(): void
  /** Leave the current box in place and exit the gesture (commit path). */
  release(): void
}

/** Coalesces work to one callback per animation frame. Injected for testability. */
export interface FrameScheduler {
  /** Request a frame; calling again before it fires is a no-op. */
  schedule(callback: () => void): void
  /** Cancel a pending frame, if any. */
  cancel(): void
}

/** Gesture lifecycle callbacks. `onChange` is transient; `onCommit` is the only history boundary. */
export interface GestureCallbacks {
  /** Fired once at `begin`, before any write. */
  onStart?(snapshot: GestureSnapshot): void
  /** Fired once per frame with the live (unrounded) box. No history. */
  onChange?(snapshot: GestureSnapshot): void
  /** Fired once on a successful end, with the rounded, atomic commit. */
  onCommit?(commit: GestureCommit): void
  /** Fired once on cancel; emits nothing to history. */
  onCancel?(): void
}
