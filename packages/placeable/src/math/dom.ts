import type { Matrix } from './types'

/**
 * The minimal structural shape of a browser `DOMMatrix` that the bridge
 * reads or produces. Declared locally so the core never depends on the DOM
 * type library and stays usable in Node, workers, and SSR.
 */
export interface DOMMatrixLike {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

interface DOMMatrixConstructor {
  new (init?: readonly number[]): DOMMatrixLike
}

function resolveConstructor(): DOMMatrixConstructor {
  const ctor = (globalThis as { DOMMatrix?: DOMMatrixConstructor }).DOMMatrix
  if (!ctor) {
    throw new Error('DOMMatrix is not available in this environment')
  }
  return ctor
}

/**
 * Builds a browser `DOMMatrix` from a core `Matrix`. Lazy: importing this
 * module is safe without a DOM, but calling it requires `DOMMatrix` to exist.
 */
export function toDOMMatrix(m: Matrix): DOMMatrixLike {
  const Ctor = resolveConstructor()
  return new Ctor([m.a, m.b, m.c, m.d, m.e, m.f])
}

/** Reads a core `Matrix` from any `DOMMatrix`-like value (e.g. computed style). */
export function fromDOMMatrix(dm: DOMMatrixLike): Matrix {
  return { a: dm.a, b: dm.b, c: dm.c, d: dm.d, e: dm.e, f: dm.f }
}
