import { afterEach, describe, expect, it } from 'vitest'
import { center } from '../math/box'
import {
  applyToPoint,
  compose,
  rotation,
  scaling,
  toMatrixString,
  translation,
} from '../math/matrix'
import type { Box, Matrix } from '../math/types'
import { idleChromeBox } from './chrome-geometry'

type MutableGlobal = Record<string, unknown>
const globalRef = globalThis as MutableGlobal

/** Minimal DOMMatrix that parses `matrix(a, b, c, d, e, f)` (and identity for `none`). */
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
  offsetWidth: number
  offsetHeight: number
  parentElement: FakeElement | null
  getBoundingClientRect(): Rect
}

const zeroRect: Rect = { left: 0, top: 0, width: 0, height: 0 }

function asElement(el: FakeElement): Element {
  return el as unknown as Element
}

function asHTML(el: FakeElement): HTMLElement {
  return el as unknown as HTMLElement
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

/** The container-space rect whose center equals the local box center mapped by `containerFromLocal`. */
function renderedRect(containerFromLocal: Matrix, box: Box, containerRect: Rect): Rect {
  const c = applyToPoint(containerFromLocal, center(box))
  return { left: containerRect.left + c.x, top: containerRect.top + c.y, width: 0, height: 0 }
}

/** A target laid out with the given (own) transform, size, and rendered rect. */
function makeTarget(
  parent: FakeElement | null,
  size: { width: number; height: number },
  rect: Rect,
  transform = 'none',
): FakeElement {
  return {
    __transform: transform,
    offsetWidth: size.width,
    offsetHeight: size.height,
    parentElement: parent,
    getBoundingClientRect: () => rect,
  }
}

function makeContainer(rect: Rect): FakeElement {
  return {
    __transform: 'none',
    offsetWidth: rect.width,
    offsetHeight: rect.height,
    parentElement: null,
    getBoundingClientRect: () => rect,
  }
}

describe('idleChromeBox', () => {
  it('returns the target box in container space for an untransformed ancestor (identity)', () => {
    installGlobals()
    const containerRect: Rect = { left: 0, top: 0, width: 500, height: 500 }
    const container = makeContainer(containerRect)
    const local: Box = { x: 0, y: 0, width: 80, height: 40, rotation: 0 }
    const target = makeTarget(
      container,
      { width: 80, height: 40 },
      renderedRect(translation(0, 0), local, containerRect),
    )

    const result = idleChromeBox(asHTML(target), asElement(container))

    expect(result.width).toBeCloseTo(80, 9)
    expect(result.height).toBeCloseTo(40, 9)
    expect(result.rotation).toBeCloseTo(0, 9)
    expect(result.x).toBeCloseTo(0, 9)
    expect(result.y).toBeCloseTo(0, 9)
  })

  it('scales the chrome box through a uniformly scaled ancestor', () => {
    installGlobals()
    const containerRect: Rect = { left: 100, top: 50, width: 800, height: 600 }
    const container = makeContainer(containerRect)
    const containerFromLocal = scaling(2)
    const group: FakeElement = {
      __transform: toMatrixString(scaling(2)),
      offsetWidth: 0,
      offsetHeight: 0,
      parentElement: container,
      getBoundingClientRect: () => zeroRect,
    }
    const local: Box = { x: 0, y: 0, width: 80, height: 40, rotation: 0 }
    const target = makeTarget(
      group,
      { width: 80, height: 40 },
      renderedRect(containerFromLocal, local, containerRect),
    )

    const result = idleChromeBox(asHTML(target), asElement(container))

    expect(result.width).toBeCloseTo(160, 9)
    expect(result.height).toBeCloseTo(80, 9)
    expect(result.rotation).toBeCloseTo(0, 9)
    const expectedCenter = applyToPoint(containerFromLocal, center(local))
    expect(result.x + result.width / 2).toBeCloseTo(expectedCenter.x, 9)
    expect(result.y + result.height / 2).toBeCloseTo(expectedCenter.y, 9)
  })

  it('rotates and scales the chrome box through a rotated, scaled ancestor', () => {
    installGlobals()
    const containerRect: Rect = { left: 10, top: 20, width: 700, height: 520 }
    const container = makeContainer(containerRect)
    const linear = compose(rotation(Math.PI / 6), scaling(1.5))
    const group: FakeElement = {
      __transform: toMatrixString(linear),
      offsetWidth: 0,
      offsetHeight: 0,
      parentElement: container,
      getBoundingClientRect: () => zeroRect,
    }
    const local: Box = { x: 0, y: 0, width: 80, height: 40, rotation: 0 }
    const target = makeTarget(
      group,
      { width: 80, height: 40 },
      renderedRect(linear, local, containerRect),
    )

    const result = idleChromeBox(asHTML(target), asElement(container))

    expect(result.width).toBeCloseTo(120, 6) // 80 × 1.5
    expect(result.height).toBeCloseTo(60, 6) // 40 × 1.5
    expect(result.rotation).toBeCloseTo(Math.PI / 6, 6)
    const expectedCenter = applyToPoint(linear, center(local))
    expect(result.x + result.width / 2).toBeCloseTo(expectedCenter.x, 6)
    expect(result.y + result.height / 2).toBeCloseTo(expectedCenter.y, 6)
  })
})
