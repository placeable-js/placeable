import { describe, expect, it } from 'vitest'
import { containerBox } from '../../coords/types'
import { equals as boxEquals, center, corners } from '../../math/box'
import type { Box, Vec2 } from '../../math/types'
import { equals as vecEquals } from '../../math/vec2'
import { frameOf } from '../../test-utils/frames'
import { runOp } from '../../test-utils/kernel'
import { fromBoxFrame, HANDLE_DIRECTIONS, type Handle } from './handles'
import { createResize } from './resize'

const HANDLES: readonly Handle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

/** Corner indices (TL=0, TR=1, BR=2, BL=3) that must stay fixed for a handle. */
function anchorIndices(handle: Handle): number[] {
  const dir = HANDLE_DIRECTIONS[handle]
  const signs: ReadonlyArray<Vec2> = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ]
  const indices: number[] = []
  signs.forEach((s, i) => {
    if ((dir.x === 0 || s.x === -dir.x) && (dir.y === 0 || s.y === -dir.y)) {
      indices.push(i)
    }
  })
  return indices
}

/** The local-space point of a handle on a box (corner or edge midpoint). */
function handlePoint(handle: Handle, box: Box): Vec2 {
  const dir = HANDLE_DIRECTIONS[handle]
  const c = center(box)
  return fromBoxFrame(
    { x: (dir.x * box.width) / 2, y: (dir.y * box.height) / 2 },
    c,
    Math.cos(box.rotation),
    Math.sin(box.rotation),
  )
}

describe('createResize — anchor invariance', () => {
  for (const rotation of [0, Math.PI / 6, Math.PI / 2]) {
    for (const handle of HANDLES) {
      it(`keeps the anchor fixed for "${handle}" at rotation ${rotation.toFixed(2)}`, () => {
        const start: Box = { x: 40, y: 30, width: 120, height: 80, rotation }
        const from = handlePoint(handle, start)
        const to = { x: from.x + 37, y: from.y - 23 } // arbitrary local drag

        const proposed = runOp(createResize({ handle }), { start, pointerStart: from, pointer: to })

        const before = corners(start)
        const after = corners(proposed)
        for (const i of anchorIndices(handle)) {
          expect(vecEquals(after[i] as Vec2, before[i] as Vec2, 1e-9)).toBe(true)
        }
        // The gesture actually resized the box (sanity: it is not a no-op).
        expect(boxEquals(proposed, start)).toBe(false)
      })
    }
  }
})

describe('createResize — free resize', () => {
  const start: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }

  it('grows from the east edge, west edge fixed', () => {
    const proposed = runOp(createResize({ handle: 'e' }), {
      start,
      pointerStart: { x: 100, y: 50 },
      pointer: { x: 150, y: 50 },
    })
    expect(boxEquals(proposed, { x: 0, y: 0, width: 150, height: 100, rotation: 0 })).toBe(true)
  })

  it('clamps below the minimum width', () => {
    const proposed = runOp(createResize({ handle: 'e', min: { width: 60 } }), {
      start,
      pointerStart: { x: 100, y: 50 },
      pointer: { x: 40, y: 50 }, // raw width 40 → clamped to 60
    })
    expect(proposed.width).toBe(60)
    expect(proposed.x).toBe(0) // west edge still fixed
  })

  it('clamps above the maximum width', () => {
    const proposed = runOp(createResize({ handle: 'e', max: { width: 120 } }), {
      start,
      pointerStart: { x: 100, y: 50 },
      pointer: { x: 300, y: 50 },
    })
    expect(proposed.width).toBe(120)
    expect(proposed.x).toBe(0)
  })

  it('moves both axes for a corner handle', () => {
    const proposed = runOp(createResize({ handle: 'se' }), {
      start,
      pointerStart: { x: 100, y: 100 },
      pointer: { x: 130, y: 160 },
    })
    expect(boxEquals(proposed, { x: 0, y: 0, width: 130, height: 160, rotation: 0 })).toBe(true)
  })
})

describe('createResize — aspect lock', () => {
  it('locks a corner to the start ratio along the diagonal', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 50, rotation: 0 } // ratio 2
    const proposed = runOp(createResize({ handle: 'se', aspect: true }), {
      start,
      pointerStart: { x: 100, y: 50 },
      pointer: { x: 40, y: 30 },
    })
    expect(boxEquals(proposed, { x: 0, y: 0, width: 44, height: 22, rotation: 0 }, 1e-9)).toBe(true)
    expect(proposed.width / proposed.height).toBeCloseTo(2, 9)
  })

  it('locks an edge to an explicit ratio, cross-axis centered', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 50, rotation: 0 }
    const proposed = runOp(createResize({ handle: 'e', aspect: 2 }), {
      start,
      pointerStart: { x: 100, y: 25 },
      pointer: { x: 140, y: 25 },
    })
    // width 140 → height 70, grown symmetrically about the center line (y: 25).
    expect(boxEquals(proposed, { x: 0, y: -10, width: 140, height: 70, rotation: 0 }, 1e-9)).toBe(
      true,
    )
  })

  it('locks a vertical edge to the ratio, cross-axis centered', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 50, rotation: 0 } // ratio 2
    const proposed = runOp(createResize({ handle: 's', aspect: true }), {
      start,
      pointerStart: { x: 50, y: 50 },
      pointer: { x: 50, y: 90 },
    })
    // height 90 → width 180, grown symmetrically about the center line (x: 50); north edge fixed.
    expect(boxEquals(proposed, { x: -40, y: 0, width: 180, height: 90, rotation: 0 }, 1e-9)).toBe(
      true,
    )
  })

  it('lets the cross-axis (width) limit win on a vertical edge', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 50, rotation: 0 }
    const proposed = runOp(createResize({ handle: 's', aspect: 2, max: { width: 60 } }), {
      start,
      pointerStart: { x: 50, y: 50 },
      pointer: { x: 50, y: 90 }, // wants height 90 → width 180, capped at 60 → height 30
    })
    expect(proposed.width).toBeCloseTo(60, 9)
    expect(proposed.height).toBeCloseTo(30, 9)
    expect(proposed.y).toBeCloseTo(0, 9) // north edge still fixed
  })

  it('honors a trigger predicate (off unless shift)', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 50, rotation: 0 }
    const resize = createResize({ handle: 'se', aspect: { trigger: (m) => m.shift } })
    const free = runOp(resize, {
      start,
      pointerStart: { x: 100, y: 50 },
      pointer: { x: 200, y: 60 },
    })
    expect(boxEquals(free, { x: 0, y: 0, width: 200, height: 60, rotation: 0 })).toBe(true)

    const locked = runOp(resize, {
      start,
      pointerStart: { x: 100, y: 50 },
      pointer: { x: 200, y: 60 },
      modifiers: { shift: true, alt: false, meta: false, ctrl: false },
    })
    expect(locked.width / locked.height).toBeCloseTo(2, 9)
  })

  it('ignores a degenerate start ratio (zero height) with no explicit ratio', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 0, rotation: 0 }
    const proposed = runOp(createResize({ handle: 'se', aspect: true }), {
      start,
      pointerStart: { x: 100, y: 0 },
      pointer: { x: 130, y: 40 },
    })
    // Falls back to free resize.
    expect(proposed.width).toBeCloseTo(130, 9)
    expect(proposed.height).toBeCloseTo(40, 9)
  })

  it('lets the cross-axis limit win over the driver (edge, ratio preserved)', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 50, rotation: 0 }
    const proposed = runOp(createResize({ handle: 'e', aspect: 2, max: { height: 60 } }), {
      start,
      pointerStart: { x: 100, y: 25 },
      pointer: { x: 300, y: 25 }, // wants width 250 → height 125, capped at 60 → width 120
    })
    expect(proposed.height).toBeCloseTo(60, 9)
    expect(proposed.width).toBeCloseTo(120, 9)
  })
})

describe('createResize — bounds', () => {
  it('clamps the dragged handle to the region; the anchor stays put', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    const region = containerBox({ x: 0, y: 0, width: 130, height: 200, rotation: 0 })
    const proposed = runOp(createResize({ handle: 'e' }), {
      start,
      pointerStart: { x: 100, y: 50 },
      pointer: { x: 180, y: 50 }, // beyond the region's right edge (130)
      bounds: region,
    })
    expect(proposed.width).toBe(130) // handle pinned to the region edge
    expect(proposed.x).toBe(0) // west anchor fixed
  })
})

describe('createResize — acceptance: rotated box in a scaled + rotated canvas', () => {
  it('keeps the anchor fixed with no drift', () => {
    const frame = frameOf({ scale: 1.5, rotate: Math.PI / 6, translate: { x: 20, y: -10 } })
    const start: Box = { x: 100, y: 100, width: 80, height: 40, rotation: Math.PI / 6 }

    for (const handle of HANDLES) {
      const localFrom = handlePoint(handle, start)
      const localTo = { x: localFrom.x + 25, y: localFrom.y + 15 }
      // Express the local handle points in container space, as the host would feed them.
      const pointerStart = frame.pointToContainer(localFrom)
      const pointer = frame.pointToContainer(localTo)

      const proposed = runOp(createResize({ handle }), { start, pointerStart, pointer, frame })

      const before = corners(start)
      const after = corners(proposed)
      for (const i of anchorIndices(handle)) {
        expect(vecEquals(after[i] as Vec2, before[i] as Vec2, 1e-6)).toBe(true)
      }
      expect(boxEquals(proposed, start)).toBe(false)
    }
  })
})
