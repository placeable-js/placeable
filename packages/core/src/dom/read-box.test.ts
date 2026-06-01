import { afterEach, describe, expect, it } from 'vitest'
import { readBoxFromElement } from './read-box'

type MutableGlobal = Record<string, unknown>
const globalRef = globalThis as MutableGlobal

class FakeDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  constructor(init?: string) {
    if (init === undefined) {
      return
    }
    const values = init
      .slice(init.indexOf('(') + 1, init.indexOf(')'))
      .split(',')
      .map((part) => Number.parseFloat(part))
    this.a = values[0] ?? 1
    this.b = values[1] ?? 0
    this.c = values[2] ?? 0
    this.d = values[3] ?? 1
    this.e = values[4] ?? 0
    this.f = values[5] ?? 0
  }
}

function install(transform: string, size: { width: number; height: number }): HTMLElement {
  globalRef.DOMMatrix = FakeDOMMatrix
  globalRef.getComputedStyle = () => ({ transform }) as CSSStyleDeclaration
  return { offsetWidth: size.width, offsetHeight: size.height } as unknown as HTMLElement
}

afterEach(() => {
  delete globalRef.DOMMatrix
  delete globalRef.getComputedStyle
})

describe('readBoxFromElement', () => {
  it('reads an untransformed element (transform: none) as a plain box', () => {
    const element = install('none', { width: 50, height: 30 })
    expect(readBoxFromElement(element)).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 30,
      rotation: 0,
    })
  })

  it('recovers translation from a matrix transform', () => {
    const element = install('matrix(1, 0, 0, 1, 30, 40)', { width: 10, height: 20 })
    expect(readBoxFromElement(element)).toEqual({
      x: 30,
      y: 40,
      width: 10,
      height: 20,
      rotation: 0,
    })
  })

  it('recovers rotation from a rotation matrix', () => {
    // 90°: matrix(cos, sin, -sin, cos, 0, 0) = matrix(0, 1, -1, 0, 0, 0)
    const element = install('matrix(0, 1, -1, 0, 5, 6)', { width: 8, height: 4 })
    const box = readBoxFromElement(element)
    expect(box.rotation).toBeCloseTo(Math.PI / 2, 9)
    expect(box.x).toBe(5)
    expect(box.y).toBe(6)
  })
})
