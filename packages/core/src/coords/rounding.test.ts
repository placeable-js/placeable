import { describe, expect, it } from 'vitest'
import { exactRounding, pixelRounding, roundDesignBox, roundDesignPoint } from './rounding'
import { designBox, designPoint } from './types'

describe('rounding policies', () => {
  it('exactRounding leaves values untouched', () => {
    expect(exactRounding(123.456)).toBe(123.456)
  })

  it('pixelRounding snaps to the nearest step', () => {
    expect(pixelRounding()(3.4)).toBe(3)
    expect(pixelRounding()(3.6)).toBe(4)
    expect(pixelRounding(5)(12)).toBe(10)
  })
})

describe('design-space rounding', () => {
  it('rounds a point', () => {
    expect(roundDesignPoint(designPoint(2.4, 5.6), pixelRounding())).toEqual({ x: 2, y: 6 })
  })

  it('rounds box position and size but preserves rotation', () => {
    const rounded = roundDesignBox(
      designBox({ x: 1.4, y: 2.6, width: 9.5, height: 20.4, rotation: 0.5 }),
      pixelRounding(),
    )
    expect(rounded).toEqual({ x: 1, y: 3, width: 10, height: 20, rotation: 0.5 })
  })
})
