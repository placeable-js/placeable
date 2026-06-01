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
  Modifier,
  ModifierKeys,
  TransformWriter,
} from './types'

/** Everything needed to drive one reusable {@link GestureSession}. */
export interface GestureSessionConfig {
  /** The gesture kernel (drag/resize/rotate factory output). */
  readonly operation: GestureOperation
  /** The DOM-write seam. */
  readonly writer: TransformWriter
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
  readonly #operation: GestureOperation
  readonly #writer: TransformWriter
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
    this.#operation = config.operation
    this.#writer = config.writer
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
   * Begins a gesture. `startBox` is the target's current box in the local
   * frame, and `frame` is the container ↔ local mapping — both gesture-scoped
   * DOM reads the caller measures once at begin (never read here). `frame`
   * defaults to {@link identityFrame}. Ignored unless idle.
   */
  begin(
    startBox: Box,
    pointer: ContainerPoint,
    modifiers: ModifierKeys,
    frame: GestureFrame = identityFrame,
  ): void {
    if (this.#active !== null) {
      return
    }
    const ctx: GestureContext =
      this.#bounds !== undefined
        ? { space: this.#space, frame, bounds: this.#bounds }
        : { space: this.#space, frame }
    const pointerStart = frame.pointToLocal(pointer)
    this.#active = { start: startBox, pointerStart, pointer: pointerStart, modifiers, frame, ctx }
    this.#writer.begin()
    this.#callbacks.onStart?.(this.#snapshot(startBox, startBox, frame))
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
    this.#writer.applyBox(proposed)
    this.#writer.release()

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
    if (this.#active === null) {
      return
    }
    this.#cancelFrame()
    this.#writer.restore()
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
      this.#writer.release()
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
    this.#writer.applyBox(proposed)
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
    const proposed = this.#operation.apply(base, active.ctx)
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
