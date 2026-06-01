import { describe, expect, it } from 'vitest'
import { containerBox, containerPoint } from '../coords/types'
import { equals as boxEquals } from '../math/box'
import { compose, identity, rotation, scaling, translation } from '../math/matrix'
import type { Box } from '../math/types'
import { inRange, mulberry32 } from '../test-utils/random'
import { identityFrame } from './frame'
import { matrixFrame } from './matrix-frame'

const TWO_PI = Math.PI * 2

/** A similarity `localFromContainer` built from the documented translate→rotate→scale order. */
function similarity(tx: number, ty: number, radians: number, scale: number) {
  return compose(translation(tx, ty), rotation(radians), scaling(scale))
}

describe('matrixFrame', () => {
  it('matches identityFrame for the identity matrix', () => {
    const frame = matrixFrame(identity())
    const local: Box = { x: 3, y: 4, width: 10, height: 20, rotation: 0.5 }
    const container = containerBox({ x: 1, y: 2, width: 5, height: 6, rotation: 0.25 })

    expect(frame.pointToLocal(containerPoint(12, -7))).toEqual(
      identityFrame.pointToLocal(containerPoint(12, -7)),
    )
    expect(frame.pointToContainer({ x: 12, y: -7 })).toEqual({ x: 12, y: -7 })
    expect(boxEquals(frame.boxToContainer(local), local)).toBe(true)
    expect(boxEquals(frame.boxToLocal(container), container)).toBe(true)
  })

  it('maps points between container and local (inverse pair)', () => {
    // localFromContainer scales container→local by 2 about a translated origin.
    const frame = matrixFrame(similarity(5, -3, 0, 2))
    const local = frame.pointToLocal(containerPoint(10, 10))
    expect(local).toEqual({ x: 25, y: 17 })
    // pointToContainer inverts it exactly.
    expect(frame.pointToContainer(local)).toEqual({ x: 10, y: 10 })
  })

  it('applies the rendering scale and rotation to boxes (container readout)', () => {
    // localFromContainer scales container→local ×2, so local→container is ×0.5.
    const frame = matrixFrame(scaling(2))
    const result = frame.boxToContainer({ x: 4, y: 6, width: 10, height: 20, rotation: 0 })
    // Center (9,16) → (4.5,8); size halved; top-left rebuilt from the mapped center.
    expect(boxEquals(result, { x: 2, y: 3, width: 5, height: 10, rotation: 0 })).toBe(true)
  })

  it('adds the frame rotation to the box rotation', () => {
    const angle = Math.PI / 6
    // localFromContainer rotates container→local by +angle, so local→container is −angle.
    const frame = matrixFrame(rotation(angle))
    const result = frame.boxToContainer({ x: -5, y: -10, width: 10, height: 20, rotation: 0 })
    expect(result.rotation).toBeCloseTo(-angle, 9)
  })

  it('round-trips oriented boxes under random similarity frames', () => {
    const rng = mulberry32(0xc0ffee)
    for (let i = 0; i < 200; i++) {
      const frame = matrixFrame(
        similarity(
          inRange(rng(), -500, 500),
          inRange(rng(), -500, 500),
          inRange(rng(), 0, TWO_PI),
          inRange(rng(), 0.1, 5),
        ),
      )
      const local: Box = {
        x: inRange(rng(), -200, 200),
        y: inRange(rng(), -200, 200),
        width: inRange(rng(), 1, 300),
        height: inRange(rng(), 1, 300),
        rotation: inRange(rng(), -Math.PI, Math.PI),
      }
      const back = frame.boxToLocal(frame.boxToContainer(local))
      expect(boxEquals(back, local, 1e-6)).toBe(true)
    }
  })

  it('round-trips points under random similarity frames', () => {
    const rng = mulberry32(0x1234)
    for (let i = 0; i < 200; i++) {
      const frame = matrixFrame(
        similarity(
          inRange(rng(), -500, 500),
          inRange(rng(), -500, 500),
          inRange(rng(), 0, TWO_PI),
          inRange(rng(), 0.1, 5),
        ),
      )
      const point = containerPoint(inRange(rng(), -400, 400), inRange(rng(), -400, 400))
      const back = frame.pointToContainer(frame.pointToLocal(point))
      expect(back.x).toBeCloseTo(point.x, 6)
      expect(back.y).toBeCloseTo(point.y, 6)
    }
  })

  it('throws on a degenerate (zero-scale) matrix', () => {
    expect(() => matrixFrame(scaling(0))).toThrow(/degenerate/)
  })

  it('throws on non-uniform scale', () => {
    expect(() => matrixFrame({ a: 1.5, b: 0, c: 0, d: 2, e: 0, f: 0 })).toThrow(/similarity/)
  })

  it('throws on skew', () => {
    expect(() => matrixFrame({ a: 1, b: 0, c: 0.5, d: 1, e: 0, f: 0 })).toThrow(/similarity/)
  })

  it('throws on a reflection (orientation flip)', () => {
    // scaleX(-1): a=-1, d=1 → not orientation-preserving.
    expect(() => matrixFrame({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toThrow(/similarity/)
  })
})
