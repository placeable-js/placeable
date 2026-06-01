import { describe, expect, it } from 'vitest'
import { CoordinateSpace } from '../../coords/space'
import { containerBox } from '../../coords/types'
import { aabb } from '../../math/box'
import type { Box } from '../../math/types'
import { noModifiers } from '../../test-utils/input'
import { identityFrame } from '../frame'
import type { GestureContext, GestureState } from '../types'
import { bounds } from './bounds'

const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })

function context(region?: Box): GestureContext {
  return region === undefined
    ? { space, frame: identityFrame }
    : { space, frame: identityFrame, bounds: containerBox(region) }
}

function stateWith(proposed: Box): GestureState {
  return {
    start: proposed,
    proposed,
    pointerStart: { x: 0, y: 0 },
    pointer: { x: 0, y: 0 },
    modifiers: noModifiers,
  }
}

const region: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }

describe('bounds modifier', () => {
  it('is a no-op when no bounds are configured', () => {
    const input = stateWith({ x: 500, y: 500, width: 10, height: 10, rotation: 0 })
    expect(bounds(input, context())).toBe(input)
  })

  it('is a no-op when the box already fits', () => {
    const input = stateWith({ x: 10, y: 10, width: 20, height: 20, rotation: 0 })
    expect(bounds(input, context(region))).toBe(input)
  })

  it('shifts a box back inside the right/bottom edges', () => {
    const result = bounds(
      stateWith({ x: 90, y: 95, width: 20, height: 20, rotation: 0 }),
      context(region),
    )
    expect(result.proposed).toEqual({ x: 80, y: 80, width: 20, height: 20, rotation: 0 })
  })

  it('shifts a box back inside the left/top edges', () => {
    const result = bounds(
      stateWith({ x: -5, y: -8, width: 20, height: 20, rotation: 0 }),
      context(region),
    )
    expect(result.proposed).toEqual({ x: 0, y: 0, width: 20, height: 20, rotation: 0 })
  })

  it('pins a box larger than the bounds to the minimum edge', () => {
    const result = bounds(
      stateWith({ x: 40, y: 40, width: 200, height: 200, rotation: 0 }),
      context(region),
    )
    expect(result.proposed.x).toBe(0)
    expect(result.proposed.y).toBe(0)
  })

  it('clamps using the rotated axis-aligned bounding box, not the unrotated box', () => {
    // A 20×20 box rotated 45° has an AABB of ~28.28 px; placed near the right
    // edge its AABB overflows even though its unrotated right edge does not.
    const input = stateWith({ x: 85, y: 40, width: 20, height: 20, rotation: Math.PI / 4 })
    const result = bounds(input, context(region))
    expect(result).not.toBe(input)
    const resultAabb = aabb(result.proposed)
    expect(resultAabb.x + resultAabb.width).toBeCloseTo(100, 6)
    expect(resultAabb.x).toBeGreaterThanOrEqual(-1e-6)
  })
})
