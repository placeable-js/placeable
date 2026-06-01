import type { RoundingPolicy } from '../coords/rounding'
import { exactRounding, roundDesignBox } from '../coords/rounding'
import type { ContainerBox, ContainerPoint, DesignBox } from '../coords/types'
import type { Box, Vec2 } from '../math/types'
import { identityFrame } from './frame'
import { runModifiers } from './pipeline'
import { rafScheduler } from './scheduler'
import type {
  CoordinateSpaceLike,
  FrameScheduler,
  GestureCallbacks,
  GestureCommit,
  GestureContext,
  GestureFrame,
  GestureOperation,
  GesturePhase,
  GestureSnapshot,
  GestureState,
  GestureTarget,
  Modifier,
  ModifierKeys,
  TransformWriter,
} from './types'

/**
 * The cross-gesture concerns of a reusable {@link GestureSession}. The
 * per-gesture target — `operation`, `writer`, `startBox`, `frame` — is supplied
 * at {@link GestureSession.begin} via a {@link GestureTarget}, so one session
 * instance serves every operation and target with no per-gesture reallocation.
 */
export interface GestureSessionConfig {
  /** Container ↔ design conversion for the commit/readout boundary. */
  readonly space: CoordinateSpaceLike
  /** Modifier chain, applied in order after the kernel. Defaults to none. */
  readonly modifiers?: readonly Modifier[]
  /** Commit-time rounding policy. Defaults to {@link exactRounding}. */
  readonly rounding?: RoundingPolicy
  /** Frame coalescer. Defaults to {@link rafScheduler}. */
  readonly scheduler?: FrameScheduler
  /** Containment region in container space, passed to modifiers. */
  readonly bounds?: ContainerBox
  /** Lifecycle callbacks. */
  readonly callbacks?: GestureCallbacks
}

interface ActiveGesture {
  readonly start: Box
  readonly pointerStart: Vec2
  /** Container ↔ local mapping captured for this gesture (DOM state at `begin`). */
  readonly frame: GestureFrame
  /** Read-only environment shared by the kernel and modifiers, built once per gesture. */
  readonly ctx: GestureContext
  /** The DOM-write seam for the grabbed target, captured at `begin`. */
  readonly writer: TransformWriter
  /** The gesture kernel for the grabbed handle/operation, captured at `begin`. */
  readonly operation: GestureOperation
  pointer: Vec2
  modifiers: ModifierKeys
}

/**
 * The gesture-neutral engine. It captures a start box, coalesces input into one
 * pipeline run + one write + one `onChange` per frame, and emits exactly one
 * terminal event (`onCommit` or `onCancel`) before resetting to `idle` for
 * reuse. It performs no DOM access — input arrives in container space, the
 * start box is supplied by the caller, and writes go through the injected
 * {@link TransformWriter}.
 */
export class GestureSession {
  readonly #space: CoordinateSpaceLike
  readonly #bounds: ContainerBox | undefined
  readonly #modifiers: readonly Modifier[]
  readonly #rounding: RoundingPolicy
  readonly #scheduler: FrameScheduler
  readonly #callbacks: GestureCallbacks
  readonly #flush: () => void = () => {
    this.#runFrame()
  }

  #active: ActiveGesture | null = null
  #frameScheduled = false

  constructor(config: GestureSessionConfig) {
    this.#space = config.space
    this.#bounds = config.bounds
    this.#modifiers = config.modifiers ?? []
    this.#rounding = config.rounding ?? exactRounding
    this.#scheduler = config.scheduler ?? rafScheduler()
    this.#callbacks = config.callbacks ?? {}
  }

  /** Whether a gesture is in progress. */
  get phase(): GesturePhase {
    return this.#active === null ? 'idle' : 'active'
  }

  /**
   * Begins a gesture against `target`, which bundles the per-gesture
   * `operation`, `writer`, `startBox`, and `frame` — all gesture-scoped state
   * the caller supplies once at begin (the DOM reads happen there, never here).
   * `target.frame` defaults to {@link identityFrame}. Ignored unless idle.
   */
  begin(target: GestureTarget, pointer: ContainerPoint, modifiers: ModifierKeys): void {
    if (this.#active !== null) {
      return
    }
    const frame = target.frame ?? identityFrame
    const ctx: GestureContext =
      this.#bounds !== undefined
        ? { space: this.#space, frame, bounds: this.#bounds }
        : { space: this.#space, frame }
    const pointerStart = frame.pointToLocal(pointer)
    this.#active = {
      start: target.startBox,
      pointerStart,
      pointer: pointerStart,
      modifiers,
      frame,
      ctx,
      writer: target.writer,
      operation: target.operation,
    }
    target.writer.begin()
    this.#callbacks.onStart?.(this.#snapshot(target.startBox, target.startBox, frame))
  }

  /** Records the latest pointer and schedules a frame. Ignored unless active. */
  update(pointer: ContainerPoint, modifiers: ModifierKeys): void {
    if (this.#active === null) {
      return
    }
    this.#active.pointer = this.#active.frame.pointToLocal(pointer)
    this.#active.modifiers = modifiers
    if (!this.#frameScheduled) {
      this.#frameScheduled = true
      this.#scheduler.schedule(this.#flush)
    }
  }

  /**
   * Ends the gesture: runs one final pipeline pass for the latest input
   * (without firing `onChange`), syncs the writer to the committed box, and
   * emits one rounded `onCommit`. Ignored unless active.
   */
  end(pointer: ContainerPoint, modifiers: ModifierKeys): void {
    const active = this.#active
    if (active === null) {
      return
    }
    this.#cancelFrame()
    active.pointer = active.frame.pointToLocal(pointer)
    active.modifiers = modifiers

    const proposed = this.#computeProposed(active)
    active.writer.applyBox(proposed)
    active.writer.release()

    const commit: GestureCommit = {
      box: roundDesignBox(this.#toDesign(proposed, active.frame), this.#rounding),
      startBox: roundDesignBox(this.#toDesign(active.start, active.frame), this.#rounding),
    }
    this.#reset()
    this.#callbacks.onCommit?.(commit)
  }

  /**
   * Cancels the gesture: reverts the DOM to its pre-gesture state and emits
   * `onCancel` (nothing to history). Ignored unless active.
   */
  cancel(): void {
    const active = this.#active
    if (active === null) {
      return
    }
    this.#cancelFrame()
    active.writer.restore()
    this.#reset()
    this.#callbacks.onCancel?.()
  }

  /**
   * Tears down the session. If a gesture is active the writer is released
   * (DOM left as-is, no events emitted). Idempotent.
   */
  destroy(): void {
    this.#cancelFrame()
    if (this.#active !== null) {
      this.#active.writer.release()
    }
    this.#reset()
  }

  #runFrame(): void {
    this.#frameScheduled = false
    const active = this.#active
    if (active === null) {
      return
    }
    const proposed = this.#computeProposed(active)
    active.writer.applyBox(proposed)
    this.#callbacks.onChange?.(this.#snapshot(proposed, active.start, active.frame))
  }

  #computeProposed(active: ActiveGesture): Box {
    const base: GestureState = {
      start: active.start,
      proposed: active.start,
      pointerStart: active.pointerStart,
      pointer: active.pointer,
      modifiers: active.modifiers,
    }
    const proposed = active.operation.apply(base, active.ctx)
    const final = runModifiers({ ...base, proposed }, active.ctx, this.#modifiers)
    return final.proposed
  }

  #snapshot(box: Box, start: Box, frame: GestureFrame): GestureSnapshot {
    const container = frame.boxToContainer(box)
    return {
      box: this.#space.containerToDesignBox(container),
      startBox: this.#toDesign(start, frame),
      container,
    }
  }

  #toDesign(localBox: Box, frame: GestureFrame): DesignBox {
    return this.#space.containerToDesignBox(frame.boxToContainer(localBox))
  }

  #cancelFrame(): void {
    this.#scheduler.cancel()
    this.#frameScheduled = false
  }

  #reset(): void {
    this.#active = null
  }
}
