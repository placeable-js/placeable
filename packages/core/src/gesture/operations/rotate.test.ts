import { describe, expect, it } from 'vitest'
import { center } from '../../math/box'
import type { Box } from '../../math/types'
import { equals as vecEquals } from '../../math/vec2'
import { frameOf } from '../../test-utils/frames'
import { runOp } from '../../test-utils/kernel'
import { createRotate } from './rotate'

const DEG = Math.PI / 180

function atDegrees(cx: number, cy: number, radius: number, degrees: number) {
  return { x: cx + radius * Math.cos(degrees * DEG), y: cy + radius * Math.sin(degrees * DEG) }
}

describe('createRotate — center pivot (default)', () => {
  const start: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }

  it('rotates about the center, keeping the center fixed', () => {
    const proposed = runOp(createRotate(), {
      start,
      pointerStart: { x: 100, y: 50 }, // 0° about center (50,50)
      pointer: { x: 50, y: 100 }, // +90°
    })
    expect(proposed.rotation).toBeCloseTo(Math.PI / 2, 9)
    expect(vecEquals(center(proposed), center(start), 1e-9)).toBe(true)
    expect(proposed.width).toBe(100)
    expect(proposed.height).toBe(100)
  })

  it('tracks the absolute angle as the pointer sweeps', () => {
    const rotate = createRotate()
    for (const degrees of [10, 45, 120, 179]) {
      const proposed = runOp(rotate, {
        start,
        pointerStart: atDegrees(50, 50, 40, 0),
        pointer: atDegrees(50, 50, 40, degrees),
      })
      expect(proposed.rotation).toBeCloseTo(degrees * DEG, 9)
    }
  })

  it('adds onto a pre-existing rotation', () => {
    const rotated: Box = { ...start, rotation: Math.PI / 4 }
    const proposed = runOp(createRotate(), {
      start: rotated,
      pointerStart: atDegrees(50, 50, 40, 0),
      pointer: atDegrees(50, 50, 40, 30),
    })
    expect(proposed.rotation).toBeCloseTo(Math.PI / 4 + 30 * DEG, 9)
  })

  it('normalizes across the ±π boundary (no full-turn jump)', () => {
    const proposed = runOp(createRotate(), {
      start,
      pointerStart: atDegrees(50, 50, 40, 170),
      pointer: atDegrees(50, 50, 40, 190), // crosses ±180°: a +20° step, not −340°
    })
    expect(proposed.rotation).toBeCloseTo(20 * DEG, 9)
  })
})

describe('createRotate — arbitrary pivot', () => {
  it('orbits the box center about the pivot', () => {
    const start: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    const proposed = runOp(createRotate({ pivot: { x: 0, y: 0 } }), {
      start,
      pointerStart: { x: 100, y: 0 }, // 0° about pivot (0,0)
      pointer: { x: 0, y: 100 }, // +90°
    })
    // Center (50,50) orbits +90° about origin → (−50,50).
    expect(vecEquals(center(proposed), { x: -50, y: 50 }, 1e-9)).toBe(true)
    expect(proposed.rotation).toBeCloseTo(Math.PI / 2, 9)
  })

  it('default-center pivot leaves the center fixed even with an explicit equal pivot', () => {
    const start: Box = { x: 10, y: 20, width: 60, height: 40, rotation: 0 }
    const proposed = runOp(createRotate({ pivot: center(start) }), {
      start,
      pointerStart: atDegrees(40, 40, 30, 0),
      pointer: atDegrees(40, 40, 30, 50),
    })
    expect(vecEquals(center(proposed), center(start), 1e-9)).toBe(true)
  })
})

describe('createRotate — under a scaled + rotated frame', () => {
  it('measures the angle in local space (frame-agnostic)', () => {
    const frame = frameOf({ scale: 1.5, rotate: Math.PI / 5, translate: { x: 12, y: -8 } })
    const start: Box = { x: 100, y: 100, width: 80, height: 40, rotation: 0 }
    const localCenter = center(start)
    const containerCenter = frame.pointToContainer(localCenter)

    // A +90° sweep in container space about the (mapped) center.
    const proposed = runOp(createRotate(), {
      start,
      pointerStart: { x: containerCenter.x + 60, y: containerCenter.y },
      pointer: { x: containerCenter.x, y: containerCenter.y + 60 },
      frame,
    })
    expect(proposed.rotation).toBeCloseTo(Math.PI / 2, 6)
    expect(vecEquals(center(proposed), localCenter, 1e-6)).toBe(true)
  })
})
