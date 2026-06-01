import { afterEach, describe, expect, it, vi } from 'vitest'
import { rafScheduler } from './scheduler'

type MutableGlobal = Record<string, unknown>
const globalRef = globalThis as MutableGlobal

interface FakeRaf {
  request: (callback: (time: number) => void) => number
  cancel: ReturnType<typeof vi.fn>
  tick: () => void
}

function installRaf(): FakeRaf {
  const callbacks = new Map<number, (time: number) => void>()
  let next = 1
  const request = (callback: (time: number) => void): number => {
    const handle = next++
    callbacks.set(handle, callback)
    return handle
  }
  const cancel = vi.fn((handle: number) => {
    callbacks.delete(handle)
  })
  globalRef.requestAnimationFrame = request
  globalRef.cancelAnimationFrame = cancel
  return {
    request,
    cancel,
    tick: () => {
      for (const callback of [...callbacks.values()]) {
        callback(0)
      }
      callbacks.clear()
    },
  }
}

afterEach(() => {
  delete globalRef.requestAnimationFrame
  delete globalRef.cancelAnimationFrame
})

describe('rafScheduler', () => {
  it('throws with guidance when requestAnimationFrame is unavailable', () => {
    expect(() => rafScheduler().schedule(() => {})).toThrow(/requestAnimationFrame is unavailable/)
  })

  it('throws when cancelAnimationFrame is unavailable even if request exists', () => {
    globalRef.requestAnimationFrame = (cb: (t: number) => void): number => {
      cb(0)
      return 1
    }
    expect(() => rafScheduler().schedule(() => {})).toThrow(/requestAnimationFrame is unavailable/)
  })

  it('runs the scheduled callback on the next frame', () => {
    const raf = installRaf()
    const scheduler = rafScheduler()
    const spy = vi.fn()
    scheduler.schedule(spy)
    expect(spy).not.toHaveBeenCalled()
    raf.tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('coalesces repeated schedule calls into a single frame', () => {
    const raf = installRaf()
    const scheduler = rafScheduler()
    const spy = vi.fn()
    scheduler.schedule(spy)
    scheduler.schedule(spy)
    scheduler.schedule(spy)
    raf.tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('re-arms after a frame fires', () => {
    const raf = installRaf()
    const scheduler = rafScheduler()
    const spy = vi.fn()
    scheduler.schedule(spy)
    raf.tick()
    scheduler.schedule(spy)
    raf.tick()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending frame', () => {
    const raf = installRaf()
    const scheduler = rafScheduler()
    const spy = vi.fn()
    scheduler.schedule(spy)
    scheduler.cancel()
    expect(raf.cancel).toHaveBeenCalledTimes(1)
    raf.tick()
    expect(spy).not.toHaveBeenCalled()
  })

  it('is a no-op to cancel when nothing is pending', () => {
    installRaf()
    const scheduler = rafScheduler()
    expect(() => scheduler.cancel()).not.toThrow()
  })
})
