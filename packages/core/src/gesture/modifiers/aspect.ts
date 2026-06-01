import { approxEqual } from '../../math/numeric'
import type { Modifier, ModifierKeys } from '../types'

/** Options for the {@link aspect} modifier. */
export interface AspectOptions {
  /**
   * Target width-to-height ratio. Defaults to the start box's ratio (locking
   * the proportions the gesture began with).
   */
  readonly ratio?: number
  /**
   * When provided, the lock applies only while this predicate is true for the
   * frame's modifier keys (e.g. `(m) => m.shift`). Defaults to always-on.
   */
  readonly trigger?: (modifiers: ModifierKeys) => boolean
}

/**
 * Locks the proposed box to a fixed width-to-height ratio. Width is the driver:
 * height is derived as `width / ratio`. A no-op when the lock is not triggered,
 * when no usable ratio exists (degenerate start height with no explicit ratio),
 * or when the proposed box already matches.
 *
 * Phase 1 has no size-changing kernel, so this is exercised by unit tests until
 * the resize kernel (Phase 2) drives it through the chain.
 */
export function aspect(options: AspectOptions = {}): Modifier {
  return (state) => {
    if (options.trigger !== undefined && !options.trigger(state.modifiers)) {
      return state
    }

    const ratio = options.ratio ?? startRatio(state.start.width, state.start.height)
    if (ratio === undefined || ratio <= 0) {
      return state
    }

    const height = state.proposed.width / ratio
    if (approxEqual(height, state.proposed.height)) {
      return state
    }
    return { ...state, proposed: { ...state.proposed, height } }
  }
}

/** The start box's width-to-height ratio, or `undefined` when height is ~0. */
function startRatio(width: number, height: number): number | undefined {
  return approxEqual(height, 0) ? undefined : width / height
}
