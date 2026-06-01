import { describe, expect, it } from 'vitest'
import { CoordinateSpace } from '../coords/space'
import { noModifiers } from '../test-utils/input'
import { identityFrame } from './frame'
import { runModifiers } from './pipeline'
import type { GestureContext, GestureState, Modifier } from './types'

const ctx: GestureContext = {
  space: new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 }),
  frame: identityFrame,
}

function state(x: number): GestureState {
  const box = { x, y: 0, width: 10, height: 10, rotation: 0 }
  return {
    start: box,
    proposed: box,
    pointerStart: { x: 0, y: 0 },
    pointer: { x: 0, y: 0 },
    modifiers: noModifiers,
  }
}

const shiftX =
  (delta: number): Modifier =>
  (s) => ({ ...s, proposed: { ...s.proposed, x: s.proposed.x + delta } })

describe('runModifiers', () => {
  it('applies modifiers left-to-right', () => {
    const result = runModifiers(state(0), ctx, [shiftX(1), shiftX(10)])
    expect(result.proposed.x).toBe(11)
  })

  it('returns the same reference when the chain is empty', () => {
    const input = state(5)
    expect(runModifiers(input, ctx, [])).toBe(input)
  })

  it('preserves a no-op modifier’s reference identity', () => {
    const input = state(5)
    const noop: Modifier = (s) => s
    expect(runModifiers(input, ctx, [noop])).toBe(input)
  })
})
