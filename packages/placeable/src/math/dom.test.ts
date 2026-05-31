import { afterEach, describe, expect, it } from 'vitest'
import { fromDOMMatrix, toDOMMatrix } from './dom'
import { identity } from './matrix'

type MutableGlobal = Record<string, unknown>

class FakeDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  constructor(init?: readonly number[]) {
    if (init) {
      this.a = init[0] ?? 1
      this.b = init[1] ?? 0
      this.c = init[2] ?? 0
      this.d = init[3] ?? 1
      this.e = init[4] ?? 0
      this.f = init[5] ?? 0
    }
  }
}

const globalRef = globalThis as MutableGlobal

afterEach(() => {
  delete globalRef.DOMMatrix
})

describe('domMatrix bridge', () => {
  it('throws when DOMMatrix is unavailable', () => {
    expect(globalRef.DOMMatrix).toBeUndefined()
    expect(() => toDOMMatrix(identity())).toThrow()
  })

  it('round-trips a Matrix through a DOMMatrix-like value', () => {
    globalRef.DOMMatrix = FakeDOMMatrix
    const m = { a: 2, b: 0, c: 0, d: 3, e: 4, f: 5 }
    const dm = toDOMMatrix(m)
    expect({ a: dm.a, b: dm.b, c: dm.c, d: dm.d, e: dm.e, f: dm.f }).toEqual(m)
    expect(fromDOMMatrix(dm)).toEqual(m)
  })
})
