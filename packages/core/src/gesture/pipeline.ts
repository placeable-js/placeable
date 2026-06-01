import type { GestureContext, GestureState, Modifier } from './types'

/**
 * Applies modifiers left-to-right, threading the state through each. Order is
 * the caller's contract — the chain never reorders. Pure: each modifier
 * returns the same reference when it makes no change, so a no-op chain
 * allocates nothing.
 */
export function runModifiers(
  state: GestureState,
  ctx: GestureContext,
  modifiers: readonly Modifier[],
): GestureState {
  let result = state
  for (const modifier of modifiers) {
    result = modifier(result, ctx)
  }
  return result
}
