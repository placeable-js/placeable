import type { FrameScheduler } from './types'

type FrameRequest = (callback: (time: number) => void) => number
type FrameCancel = (handle: number) => void

interface AnimationFrameGlobal {
  requestAnimationFrame?: FrameRequest
  cancelAnimationFrame?: FrameCancel
}

/**
 * The default {@link FrameScheduler}, backed by `requestAnimationFrame`. The
 * global is resolved lazily on first `schedule`, so importing this module is
 * SSR-safe (no `window` access at module load). If `requestAnimationFrame` is
 * unavailable it throws with guidance to inject a scheduler — there is
 * deliberately no `setTimeout` fallback, since silent mistiming is worse than a
 * loud failure.
 */
export function rafScheduler(): FrameScheduler {
  let cancelPending: (() => void) | null = null

  return {
    schedule(callback) {
      const host = globalThis as AnimationFrameGlobal
      const request = host.requestAnimationFrame
      const cancel = host.cancelAnimationFrame
      if (request === undefined || cancel === undefined) {
        throw new Error(
          'rafScheduler: requestAnimationFrame is unavailable in this environment. ' +
            'Pass a FrameScheduler via the `scheduler` option.',
        )
      }
      if (cancelPending !== null) {
        return
      }
      const handle = request(() => {
        cancelPending = null
        callback()
      })
      cancelPending = () => cancel(handle)
    },

    cancel() {
      if (cancelPending === null) {
        return
      }
      cancelPending()
      cancelPending = null
    },
  }
}
