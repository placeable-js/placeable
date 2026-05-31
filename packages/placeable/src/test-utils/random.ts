/**
 * Deterministic PRNG (mulberry32) for reproducible property-style tests.
 * Not for production use.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Maps a unit random `[0, 1)` into `[min, max)`. */
export function inRange(unit: number, min: number, max: number): number {
  return min + unit * (max - min)
}
