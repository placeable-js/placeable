import { afterEach, describe, expect, it } from 'vitest'
import { containerPoint } from '../coords/types'
import { center, corners } from '../math/box'
import {
  applyToPoint,
  compose,
  rotation,
  scaling,
  toMatrixString,
  translation,
} from '../math/matrix'
import type { Box, Matrix } from '../math/types'
import { equals as vecEquals } from '../math/vec2'
import { computeFrame } from './compute-frame'

type MutableGlobal = Record<string, unknown>
const globalRef = globalThis as MutableGlobal

/** Minimal DOMMatrix that parses the `matrix(a, b, c, d, e, f)` strings getComputedStyle emits. */
class FakeDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  constructor(init?: string) {
    if (typeof init === 'string') {
      const match = init.match(/matrix\(([^)]+)\)/)
      if (match?.[1] !== undefined) {
        const [a, b, c, d, e, f] = match[1].split(',').map(Number)
        Object.assign(this, { a, b, c, d, e, f })
      }
    }
  }
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface FakeElement {
  __transform: string
  parentElement: FakeElement | null
  getBoundingClientRect(): Rect
}

function makeEl(transform: string, parent: FakeElement | null, rect: Rect = zeroRect): FakeElement {
  return { __transform: transform, parentElement: parent, getBoundingClientRect: () => rect }
}

const zeroRect: Rect = { left: 0, top: 0, width: 0, height: 0 }

function asElement(el: FakeElement): Element {
  return el as unknown as Element
}

/** The container-space rect whose center equals the box center mapped by `containerFromLocal`. */
function renderedRect(containerFromLocal: Matrix, box: Box, containerRect: Rect): Rect {
  const c = applyToPoint(containerFromLocal, center(box))
  return { left: containerRect.left + c.x, top: containerRect.top + c.y, width: 0, height: 0 }
}

afterEach(() => {
  delete globalRef.DOMMatrix
  delete globalRef.getComputedStyle
})

function installGlobals(): void {
  globalRef.DOMMatrix = FakeDOMMatrix
  globalRef.getComputedStyle = (el: Element) => ({
    transform: (el as unknown as FakeElement).__transform,
  })
}

describe('computeFrame', () => {
  it('recovers a pure offset (no ancestor transform) at scale 1', () => {
    installGlobals()
    const box: Box = { x: 10, y: 10, width: 50, height: 30, rotation: 0 }
    const containerFromLocal = translation(100, 50)
    const containerRect: Rect = { left: 0, top: 0, width: 500, height: 500 }
    const container = makeEl('none', null, containerRect)
    // Target is a direct child of the container — no transformed ancestors.
    const target = makeEl('none', container, renderedRect(containerFromLocal, box, containerRect))

    const { frame, scale } = computeFrame(asElement(target), asElement(container), box)

    expect(scale).toBeCloseTo(1, 9)
    const rendered = applyToPoint(containerFromLocal, { x: 10, y: 10 })
    expect(
      vecEquals(frame.pointToLocal(containerPoint(rendered.x, rendered.y)), { x: 10, y: 10 }, 1e-9),
    ).toBe(true)
  })

  it('recovers a scaled + rotated + translated ancestor stack', () => {
    installGlobals()
    const box: Box = { x: 40, y: 60, width: 80, height: 40, rotation: Math.PI / 7 }
    const containerFromLocal = compose(translation(20, -10), rotation(Math.PI / 6), scaling(1.5))
    const containerRect: Rect = { left: 1000, top: 500, width: 800, height: 600 }
    const container = makeEl('none', null, containerRect)
    // The ancestor group carries only the linear part; translation comes from layout.
    const groupLinear = compose(rotation(Math.PI / 6), scaling(1.5))
    const group = makeEl(toMatrixString(groupLinear), container)
    const target = makeEl('none', group, renderedRect(containerFromLocal, box, containerRect))

    const { frame, scale } = computeFrame(asElement(target), asElement(container), box)

    expect(scale).toBeCloseTo(1.5, 9)
    for (const local of corners(box)) {
      const rendered = applyToPoint(containerFromLocal, local)
      const back = frame.pointToLocal(containerPoint(rendered.x, rendered.y))
      expect(vecEquals(back, local, 1e-6)).toBe(true)
    }
  })

  it('multiplies nested ancestor transforms and ignores untransformed wrappers', () => {
    installGlobals()
    const box: Box = { x: 0, y: 0, width: 20, height: 20, rotation: 0 }
    const containerRect: Rect = zeroRect
    const container = makeEl('none', null, containerRect)
    const outerZoom = makeEl(toMatrixString(scaling(2)), container)
    const emptyWrapper = makeEl('', outerZoom) // transform: '' is skipped
    const noneWrapper = makeEl('none', emptyWrapper) // transform: 'none' is skipped
    const innerZoom = makeEl(toMatrixString(scaling(3)), noneWrapper)
    // Effective scale is 2 × 3 = 6.
    const containerFromLocal = scaling(6)
    const target = makeEl('none', innerZoom, renderedRect(containerFromLocal, box, containerRect))

    const { frame, scale } = computeFrame(asElement(target), asElement(container), box)

    expect(scale).toBeCloseTo(6, 9)
    const rendered = applyToPoint(containerFromLocal, { x: 5, y: 5 })
    expect(
      vecEquals(frame.pointToLocal(containerPoint(rendered.x, rendered.y)), { x: 5, y: 5 }, 1e-9),
    ).toBe(true)
  })

  it('rejects a non-similarity ancestor stack (non-uniform scale)', () => {
    installGlobals()
    const box: Box = { x: 0, y: 0, width: 10, height: 10, rotation: 0 }
    const container = makeEl('none', null)
    const skew = makeEl(toMatrixString(scaling(2, 3)), container)
    const target = makeEl('none', skew)

    expect(() => computeFrame(asElement(target), asElement(container), box)).toThrow()
  })
})
