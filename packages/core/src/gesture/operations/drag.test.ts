import { describe, expect, it } from 'vitest'
import { equals as boxEquals } from '../../math/box'
import type { Box } from '../../math/types'
import { frameOf } from '../../test-utils/frames'
import { runOp } from '../../test-utils/kernel'
import { createDrag } from './drag'

const start: Box = { x: 10, y: 20, width: 50, height: 30, rotation: 0.3 }

describe('createDrag', () => {
  it('translates by the pointer delta under the identity frame', () => {
    const proposed = runOp(createDrag(), {
      start,
      pointerStart: { x: 100, y: 100 },
      pointer: { x: 130, y: 80 },
    })
    expect(boxEquals(proposed, { ...start, x: 40, y: 0 })).toBe(true)
  })

  it('is a no-op when the pointer does not move', () => {
    const proposed = runOp(createDrag(), {
      start,
      pointerStart: { x: 5, y: 5 },
      pointer: { x: 5, y: 5 },
    })
    expect(boxEquals(proposed, start)).toBe(true)
  })

  it('applies the delta in the local frame under a rotated + scaled frame', () => {
    // localFromContainer scales ×2 and rotates +90°, so a container delta maps
    // to a local delta scaled ×2 and rotated +90°.
    const frame = frameOf({ scale: 2, rotate: Math.PI / 2 })
    const proposed = runOp(createDrag(), {
      start,
      pointerStart: { x: 0, y: 0 },
      pointer: { x: 10, y: 0 }, // container delta (10, 0)
      frame,
    })
    // local delta = R(+90°)·(10,0)·2 = (0, 20)
    expect(proposed.x).toBeCloseTo(start.x + 0, 6)
    expect(proposed.y).toBeCloseTo(start.y + 20, 6)
  })
})
