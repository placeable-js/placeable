import { describe, expect, it } from 'vitest'
import { CoordinateSpace } from '../../coords/space'
import type { Box } from '../../math/types'
import { noModifiers } from '../../test-utils/input'
import { identityFrame } from '../frame'
import type { GestureContext, GestureState, ModifierKeys } from '../types'
import { aspect } from './aspect'

const ctx: GestureContext = {
  space: new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 }),
  frame: identityFrame,
}

function makeState(start: Box, proposed: Box, modifiers: ModifierKeys = noModifiers): GestureState {
  return { start, proposed, pointerStart: { x: 0, y: 0 }, pointer: { x: 0, y: 0 }, modifiers }
}

const square: Box = { x: 0, y: 0, width: 10, height: 10, rotation: 0 }

describe('aspect modifier', () => {
  it('derives height from width using the start ratio by default', () => {
    const start: Box = { x: 0, y: 0, width: 200, height: 100, rotation: 0 } // ratio 2
    const proposed: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    const result = aspect()(makeState(start, proposed), ctx)
    expect(result.proposed.height).toBe(50)
  })

  it('uses an explicit ratio over the start ratio', () => {
    const proposed: Box = { x: 0, y: 0, width: 80, height: 40, rotation: 0 }
    const result = aspect({ ratio: 1 })(makeState(square, proposed), ctx)
    expect(result.proposed.height).toBe(80)
  })

  it('only applies while the trigger predicate holds', () => {
    const proposed: Box = { x: 0, y: 0, width: 80, height: 40, rotation: 0 }
    const modifier = aspect({ ratio: 1, trigger: (m) => m.shift })

    const released = makeState(square, proposed, noModifiers)
    expect(modifier(released, ctx)).toBe(released)

    const held = makeState(square, proposed, { ...noModifiers, shift: true })
    expect(modifier(held, ctx).proposed.height).toBe(80)
  })

  it('is a no-op when the start height is degenerate and no ratio is given', () => {
    const start: Box = { x: 0, y: 0, width: 10, height: 0, rotation: 0 }
    const input = makeState(start, square)
    expect(aspect()(input, ctx)).toBe(input)
  })

  it('is a no-op for a non-positive explicit ratio', () => {
    const input = makeState(square, square)
    expect(aspect({ ratio: 0 })(input, ctx)).toBe(input)
  })

  it('returns the same reference when already on-ratio', () => {
    const input = makeState(square, square)
    expect(aspect({ ratio: 1 })(input, ctx)).toBe(input)
  })
})
