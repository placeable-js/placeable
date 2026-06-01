import { describe, expect, it } from 'vitest'
import { CoordinateSpace } from '../coords/space'
import { identityFrame } from '../gesture/frame'
import type { Handle } from '../gesture/operations/handles'
import type { GestureContext, GestureOperation, GestureState } from '../gesture/types'
import type { Box } from '../math/types'
import { noModifiers } from '../test-utils/input'
import { resolveOperation } from './resolve-operation'

const space = new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1 })
const ctx: GestureContext = { space, frame: identityFrame }
const box: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }

/** Applies an operation to a single-step state for assertion. */
function applyAt(operation: GestureOperation, pointer: Box | { x: number; y: number }): Box {
  const state: GestureState = {
    start: box,
    proposed: box,
    pointerStart: { x: 50, y: 50 },
    pointer: { x: pointer.x, y: pointer.y },
    modifiers: noModifiers,
  }
  return operation.apply(state, ctx)
}

const ALL_HANDLES: readonly Handle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

describe('resolveOperation', () => {
  it('maps "body" to a drag kernel', () => {
    const op = resolveOperation('body')
    expect(op).not.toBeNull()
    // Drag translates the whole box by the pointer delta.
    const result = applyAt(op as GestureOperation, { x: 70, y: 60 })
    expect(result).toEqual({ ...box, x: 20, y: 10 })
  })

  it('maps "rotate" to a rotate kernel', () => {
    const op = resolveOperation('rotate')
    expect(op).not.toBeNull()
    // Pointer swings 90° about the center → box rotation advances by ~π/2.
    const result = applyAt(op as GestureOperation, { x: 50, y: 100 })
    expect(result.rotation).toBeCloseTo(Math.PI / 2, 6)
  })

  it('maps each of the eight resize handles to a resize kernel', () => {
    for (const handle of ALL_HANDLES) {
      const op = resolveOperation(handle)
      expect(op, handle).not.toBeNull()
    }
    // The east handle drives width from the west anchor.
    const east = resolveOperation('e') as GestureOperation
    const result = applyAt(east, { x: 130, y: 50 })
    expect(result.width).toBe(130)
    expect(result.x).toBe(0)
  })

  it('threads resize bounds and aspect into the chosen handle', () => {
    const op = resolveOperation('e', { resize: { max: { width: 120 } } }) as GestureOperation
    const result = applyAt(op, { x: 300, y: 50 })
    expect(result.width).toBe(120) // clamped by max
  })

  it('threads min bounds into the chosen handle', () => {
    const op = resolveOperation('e', { resize: { min: { width: 60 } } }) as GestureOperation
    const result = applyAt(op, { x: 10, y: 50 })
    expect(result.width).toBe(60) // clamped by min
  })

  it('threads aspect locking into the chosen handle', () => {
    const op = resolveOperation('se', { resize: { aspect: 1 } }) as GestureOperation
    const result = applyAt(op, { x: 160, y: 120 })
    expect(result.width).toBe(result.height)
  })

  it('threads the rotate pivot', () => {
    // Pivot at the box center (50,50) is the default; an off-center pivot orbits it.
    const op = resolveOperation('rotate', { rotate: { pivot: { x: 0, y: 0 } } }) as GestureOperation
    expect(op).not.toBeNull()
  })

  it('returns null for an unrecognized handle value', () => {
    expect(resolveOperation('')).toBeNull()
    expect(resolveOperation('center')).toBeNull()
    expect(resolveOperation('BODY')).toBeNull()
  })
})
