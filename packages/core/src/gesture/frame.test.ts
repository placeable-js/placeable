import { describe, expect, it } from 'vitest'
import { containerBox, containerPoint } from '../coords/types'
import { identityFrame } from './frame'

describe('identityFrame', () => {
  it('passes points through unchanged', () => {
    expect(identityFrame.pointToLocal(containerPoint(12, -7))).toEqual({ x: 12, y: -7 })
    expect(identityFrame.pointToContainer({ x: 12, y: -7 })).toEqual({ x: 12, y: -7 })
  })

  it('re-tags boxes between local and container without altering values', () => {
    const local = { x: 3, y: 4, width: 10, height: 20, rotation: 0.5 }
    expect(identityFrame.boxToContainer(local)).toEqual(local)

    const container = containerBox({ x: 1, y: 2, width: 5, height: 6, rotation: 0 })
    expect(identityFrame.boxToLocal(container)).toEqual({
      x: 1,
      y: 2,
      width: 5,
      height: 6,
      rotation: 0,
    })
  })
})
