import { describe, expect, it } from 'vitest'
import { approxEqual } from '../math/numeric'
import { inRange, mulberry32 } from '../test-utils/random'
import { CoordinateSpace } from './space'
import { clientBox, clientPoint, containerPoint, designBox, designPoint } from './types'

describe('CoordinateSpace', () => {
  it('rejects a non-positive viewScale', () => {
    expect(() => new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 0 })).toThrow(
      RangeError,
    )
  })

  it('maps design → container with scale and pan', () => {
    const space = new CoordinateSpace({
      containerOrigin: { x: 0, y: 0 },
      viewScale: 2,
      pan: { x: 10, y: 10 },
    })
    expect(space.designToContainer(designPoint(5, 5))).toEqual({ x: 20, y: 20 })
    expect(space.containerToDesign(containerPoint(20, 20))).toEqual({ x: 5, y: 5 })
  })

  it('subtracts the container origin for client → container', () => {
    const space = new CoordinateSpace({ containerOrigin: { x: 100, y: 50 }, viewScale: 1 })
    expect(space.clientToContainer(clientPoint(120, 70))).toEqual({ x: 20, y: 20 })
  })

  it('exposes the active viewScale', () => {
    expect(new CoordinateSpace({ containerOrigin: { x: 0, y: 0 }, viewScale: 1.5 }).viewScale).toBe(
      1.5,
    )
  })

  it('round-trips points across all spaces at several zoom levels', () => {
    const rng = mulberry32(0xabcd)
    for (const viewScale of [0.5, 1, 2]) {
      const space = new CoordinateSpace({
        containerOrigin: { x: inRange(rng(), -200, 200), y: inRange(rng(), -200, 200) },
        viewScale,
        pan: { x: inRange(rng(), -100, 100), y: inRange(rng(), -100, 100) },
      })
      for (let i = 0; i < 50; i++) {
        const original = clientPoint(inRange(rng(), -1000, 1000), inRange(rng(), -1000, 1000))
        const roundTripped = space.designToClient(space.clientToDesign(original))
        expect(approxEqual(roundTripped.x, original.x)).toBe(true)
        expect(approxEqual(roundTripped.y, original.y)).toBe(true)
      }
    }
  })

  it('scales box dimensions between design and container', () => {
    const space = new CoordinateSpace({
      containerOrigin: { x: 0, y: 0 },
      viewScale: 2,
      pan: { x: 0, y: 0 },
    })
    const design = designBox({ x: 1, y: 2, width: 10, height: 20, rotation: 0.5 })
    const container = space.designToContainerBox(design)
    expect(container).toEqual({ x: 2, y: 4, width: 20, height: 40, rotation: 0.5 })
    expect(space.containerToDesignBox(container)).toEqual(design)
  })

  it('preserves box size across the client/container boundary', () => {
    const space = new CoordinateSpace({ containerOrigin: { x: 5, y: 5 }, viewScale: 3 })
    const client = clientBox({ x: 10, y: 10, width: 4, height: 6, rotation: 0 })
    const container = space.clientToContainerBox(client)
    expect(container).toEqual({ x: 5, y: 5, width: 4, height: 6, rotation: 0 })
    expect(space.containerToClientBox(container)).toEqual(client)
  })
})
